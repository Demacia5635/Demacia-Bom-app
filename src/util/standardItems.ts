/**
 * Which saved records are standard (bought, not made), so the website can
 * keep them out of the made-items lists (Search Parts, BOMs) and show them on
 * their own page (Standard Parts).
 *
 * The BOM extension saves:
 * - Onshape Standard Content, vendor parts and parts marked standard as parts
 *   with isStandardContent / markedStandard and engineer "Standard Part";
 * - a sub-assembly marked standard (a motor, a vendor gearbox...) as a BOM
 *   record with markedStandard, plus a part record with the same id.
 * Records published before a mark existed may only have some of these, so
 * any one of them counts.
 */
import { isPurchasedPart, type BomModel, type PartModel } from "./Models";

/** Engineer the extension writes for standard items. */
const STANDARD_PART_ENGINEER = "Standard Part";


export function isStandardPart(part: PartModel): boolean {
    return isPurchasedPart(part) || !!part.markedStandard || part.engineer === STANDARD_PART_ENGINEER;
}

export interface StandardSplit {
    /** Ids of standard parts. */
    standardPartIds: Set<string>;
    /** Ids of standard BOMs (bought sub-assemblies). */
    standardBomIds: Set<string>;
    /**
     * Ids of records used only inside standard BOMs: the insides of a bought
     * sub-assembly, saved by a publish from before it was marked standard.
     * Not made by the team either, so left out of the made-items lists too.
     */
    insideStandardIds: Set<string>;
}

export function splitStandard(boms: BomModel[], parts: PartModel[]): StandardSplit {
    const standardPartIds = new Set(parts.filter(isStandardPart).map((p) => p.id));
    const standardBomIds = new Set(
        boms
            .filter(
                (b) =>
                    // Marked standard or with a vendor (BOMs have no isStandardContent).
                    isPurchasedPart(b) ||
                    b.engineer === STANDARD_PART_ENGINEER ||
                    standardPartIds.has(b.id)
            )
            .map((b) => b.id)
    );

    // Parents of every part / sub-assembly.
    const parentsOf = new Map<string, Set<string>>();
    const addParent = (child: string, parent: string) => {
        if (child === parent) return;
        const set = parentsOf.get(child) ?? new Set<string>();
        set.add(parent);
        parentsOf.set(child, set);
    };
    for (const bom of boms) {
        for (const p of bom.parts ?? []) addParent(p.partID, bom.id);
        for (const s of bom.subAssemblies ?? []) addParent(s.bomID, bom.id);
    }

    // A record is inside standard when it has parents and every one of them is
    // standard or itself inside standard. Repeat until nothing changes (nested).
    const insideStandardIds = new Set<string>();
    const hidden = (id: string) => standardBomIds.has(id) || insideStandardIds.has(id);
    let changed = true;
    while (changed) {
        changed = false;
        for (const [child, parents] of parentsOf) {
            if (hidden(child)) continue;
            if ([...parents].every(hidden)) {
                insideStandardIds.add(child);
                changed = true;
            }
        }
    }

    return { standardPartIds, standardBomIds, insideStandardIds };
}

/** A record the team makes: neither standard nor only inside something standard. */
export function isMadeRecord(split: StandardSplit, id: string): boolean {
    return !split.standardPartIds.has(id) && !split.standardBomIds.has(id) && !split.insideStandardIds.has(id);
}
