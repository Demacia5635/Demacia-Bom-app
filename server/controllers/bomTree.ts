/**
 * Loading BOM trees from MongoDB, shared by GET /bom/tree/:id and
 * GET /workOrder/summary. One query per level for all the roots together;
 * a BOM reached twice (shared, or a cycle) is fetched once.
 */
import Bom from "../models/Bom";

export type BomRecord = Record<string, any>;

export interface LoadedBoms {
    /** Every BOM found, by id, roots included, in the order they were found. */
    boms: Map<string, BomRecord>;
    /** IDs the roots or their BOMs refer to that aren't saved. */
    missing: string[];
    /** True when a limit stopped the walk; what's below is left out. */
    truncated: boolean;
}

/**
 * Loads the given BOMs and all their sub-assemblies, level by level. Stops
 * (truncated) past `maxDepth` levels below the roots or `maxBoms` BOMs.
 */
export async function loadBoms(rootIDs: string[], maxDepth: number, maxBoms: number): Promise<LoadedBoms> {
    const boms = new Map<string, BomRecord>();
    const missing: string[] = [];
    const seen = new Set<string>(rootIDs);
    let level = [...seen];
    let truncated = false;

    for (let depth = 0; level.length > 0; depth++) {
        if (depth > maxDepth || boms.size + level.length > maxBoms) {
            truncated = true;
            break;
        }
        const found = await Bom.find({ id: { $in: level } }).lean<BomRecord[]>();
        for (const bom of found) boms.set(bom.id, bom);
        missing.push(...level.filter((id) => !boms.has(id)));

        const nextLevel: string[] = [];
        for (const bom of found) {
            for (const sub of bom.subAssemblies ?? []) {
                if (sub?.bomID && !seen.has(sub.bomID)) {
                    seen.add(sub.bomID);
                    nextLevel.push(sub.bomID);
                }
            }
        }
        level = nextLevel;
    }
    return { boms, missing, truncated };
}

/** The partIDs the given BOMs list. */
export function partIDsOf(boms: Iterable<BomRecord>): Set<string> {
    const ids = new Set<string>();
    for (const bom of boms) for (const part of bom.parts ?? []) if (part?.partID) ids.add(part.partID);
    return ids;
}
