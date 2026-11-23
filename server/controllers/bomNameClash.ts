/**
 * Assemblies must have folder names that can't clash in the sorted Drive
 * folders (services/driveOrganizer.ts), where an assembly's folder is named by
 * its catalog number, or by its name when it has none. The user's rule:
 * - a non-empty catalog number belongs to one BOM record in the whole database;
 * - BOMs without a catalog number in the same parent need different names.
 * Saving a BOM that breaks either is refused (409); the dry run of the Drive
 * sort lists the existing clashes so they can be fixed first.
 */
import Bom from "../models/Bom";

type BomRecord = Record<string, any>;

const label = (bom: BomRecord) => `${bom.name || bom.id} (${bom.id})`;

/** A refused save: the 409 reply's body. */
export interface BomClash {
    code: "CATALOG_NUMBER_TAKEN" | "ASSEMBLY_NAME_TAKEN";
    message: string;
    fields: string[];
    /** The other assembly that has the catalog number or name. */
    conflictsWith: { id: string; name?: string };
}
const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Two sub-assemblies of `parent` without a catalog number and with the same name, if any. */
function nameClashIn(parent: BomRecord, subs: BomRecord[], self?: string): BomClash | null {
    const byName = new Map<string, BomRecord>();
    for (const sub of subs) {
        if (trimmed(sub.catalogNumber)) continue;
        const name = trimmed(sub.name);
        if (!name) continue;
        const other = byName.get(name);
        if (other && other.id !== sub.id) {
            const theOther = other.id === self ? sub : other;
            return {
                code: "ASSEMBLY_NAME_TAKEN",
                message: `Assemblies ${label(other)} and ${label(sub)} in ${label(parent)} both have no catalog number and the same name "${name}". `
                    + "Give them catalog numbers in Onshape, then publish again.",
                fields: ["name", "catalogNumber"],
                conflictsWith: { id: theOther.id, name: theOther.name },
            };
        }
        byName.set(name, sub);
    }
    return null;
}

/**
 * Why saving BOM `id` with this body would clash, or null. Fields the body
 * leaves out keep their saved values. Saving the same record again is fine.
 */
export async function bomSaveClash(id: string, body: BomRecord): Promise<BomClash | null> {
    const saved = await Bom.findOne({ id }, { name: 1, catalogNumber: 1, subAssemblies: 1 }).lean<BomRecord>();
    const catalogNumber = trimmed("catalogNumber" in body ? body.catalogNumber : saved?.catalogNumber);
    const name = trimmed("name" in body ? body.name : saved?.name);

    // 1. The catalog number is used by another BOM.
    if (catalogNumber) {
        const other = await Bom.findOne({ catalogNumber, id: { $ne: id } }, { id: 1, name: 1 }).lean<BomRecord>();
        if (other) {
            return {
                code: "CATALOG_NUMBER_TAKEN",
                message: `Catalog number ${catalogNumber} is already used by assembly ${label(other)}. `
                    + "Give this assembly its own catalog number in Onshape, then publish again.",
                fields: ["catalogNumber"],
                conflictsWith: { id: other.id, name: other.name },
            };
        }
    }

    // 2. No catalog number, and a sibling in a parent that lists it has the same name.
    if (!catalogNumber && name) {
        const parents = await Bom.find({ "subAssemblies.bomID": id }, { id: 1, name: 1, subAssemblies: 1 }).lean<BomRecord[]>();
        const siblingIDs = [...new Set(parents.flatMap((p) => (p.subAssemblies ?? []).map((s: BomRecord) => s.bomID)))]
            .filter((sibling) => sibling && sibling !== id);
        if (siblingIDs.length) {
            const siblings = await Bom.find({ id: { $in: siblingIDs } }, { id: 1, name: 1, catalogNumber: 1 }).lean<BomRecord[]>();
            for (const parent of parents) {
                const listed = new Set((parent.subAssemblies ?? []).map((s: BomRecord) => s.bomID));
                const clash = nameClashIn(parent, [
                    { id, name, catalogNumber },
                    ...siblings.filter((s) => listed.has(s.id)),
                ], id);
                if (clash) return clash;
            }
        }
    }

    // 3. This BOM's own sub-assemblies (as the body lists them) clash by name.
    const subIDs = [...new Set(((("subAssemblies" in body ? body.subAssemblies : saved?.subAssemblies) ?? []) as BomRecord[])
        .map((s) => s?.bomID).filter((sub): sub is string => typeof sub === "string" && sub !== ""))];
    if (subIDs.length > 1) {
        const subs = await Bom.find({ id: { $in: subIDs } }, { id: 1, name: 1, catalogNumber: 1 }).lean<BomRecord[]>();
        const clash = nameClashIn({ id, name }, subs);
        if (clash) return clash;
    }
    return null;
}

export interface BomClashReport {
    /** Catalog numbers used by more than one BOM. */
    catalogNumbers: { catalogNumber: string; boms: { id: string; name?: string }[] }[];
    /** Parents with sub-assemblies that have no catalog number and the same name. */
    names: { parent: { id: string; name?: string }; name: string; boms: { id: string; name?: string }[] }[];
}

/** Every existing clash (read-only), from all the BOMs. */
export function bomClashes(boms: BomRecord[]): BomClashReport {
    const brief = (bom: BomRecord) => ({ id: bom.id, name: bom.name });
    const byCatalog = new Map<string, BomRecord[]>();
    for (const bom of boms) {
        const catalogNumber = trimmed(bom.catalogNumber);
        if (catalogNumber) byCatalog.set(catalogNumber, [...(byCatalog.get(catalogNumber) ?? []), bom]);
    }
    const catalogNumbers = [...byCatalog]
        .filter(([, group]) => group.length > 1)
        .map(([catalogNumber, group]) => ({ catalogNumber, boms: group.map(brief) }));

    const byID = new Map(boms.map((bom) => [bom.id, bom]));
    const names: BomClashReport["names"] = [];
    for (const parent of boms) {
        const byName = new Map<string, BomRecord[]>();
        const seen = new Set<string>();
        for (const ref of parent.subAssemblies ?? []) {
            const sub = byID.get(ref?.bomID);
            if (!sub || seen.has(sub.id) || trimmed(sub.catalogNumber) || !trimmed(sub.name)) continue;
            seen.add(sub.id);
            const name = trimmed(sub.name);
            byName.set(name, [...(byName.get(name) ?? []), sub]);
        }
        for (const [name, group] of byName) {
            if (group.length > 1) names.push({ parent: brief(parent), name, boms: group.map(brief) });
        }
    }
    return { catalogNumbers, names };
}
