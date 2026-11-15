import type { ApiError } from "./ApiService";
import type { BomModel } from "./Models";

/**
 * Every part under an assembly with its quantity, sub-assemblies first.
 * Sub-assemblies are loaded in parallel. `path` is the chain of assemblies
 * above this one: an assembly inside itself would otherwise recurse (and
 * fetch) forever. The same sub-assembly in two different branches is fine
 * and counted in both.
 */
export async function collectBomParts(
    fetchBom: (id: string) => Promise<BomModel>,
    targetBomId: string,
    multiplier: number,
    path: string[] = [],
): Promise<[string, number][]> {
    if (path.includes(targetBomId)) {
        throw { message: `Assembly ${targetBomId} contains itself (via ${path.join(" > ")}). Fix the BOM and publish it again.` } as ApiError;
    }
    const currentBom = await fetchBom(targetBomId);
    const subPath = [...path, targetBomId];
    const subLists = await Promise.all(
        (currentBom.subAssemblies || []).map((sub) => collectBomParts(fetchBom, sub.bomID, (sub.quantity ?? 1) * multiplier, subPath))
    );
    const ownParts = (currentBom.parts || []).map((p): [string, number] => [p.partID, (p.quantity ?? 1) * multiplier]);
    return [...subLists.flat(), ...ownParts];
}
