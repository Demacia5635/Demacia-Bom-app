import type { ApiError } from "./ApiService";
import type { BomModel } from "./Models";

/**
 * A sub-assembly bought whole (marked standard in the extension, or with a
 * vendor): a work order lists it as one purchased line, not the parts inside.
 * Same rule as the catalog-number check when making a work order.
 */
export function isBoughtAssembly(bom: Pick<BomModel, "markedStandard" | "vendor"> | null | undefined): boolean {
    return !!bom?.markedStandard || !!bom?.vendor?.trim();
}

/**
 * Every part under an assembly with its quantity, sub-assemblies first.
 * Sub-assemblies are loaded in parallel. `path` is the chain of assemblies
 * above this one: an assembly inside itself would otherwise recurse (and
 * fetch) forever. The same sub-assembly in two different branches is fine
 * and counted in both.
 *
 * A bought sub-assembly (isBoughtAssembly) is listed itself, by its BOM id,
 * and not looked inside; its record goes into `bought` (if given), since it
 * may have no part record to show it by. The top assembly is always opened.
 */
export async function collectBomParts(
    fetchBom: (id: string) => Promise<BomModel>,
    targetBomId: string,
    multiplier: number,
    path: string[] = [],
    bought?: Map<string, BomModel>,
): Promise<[string, number][]> {
    if (path.includes(targetBomId)) {
        throw { message: `Assembly ${targetBomId} contains itself (via ${path.join(" > ")}). Fix the BOM and publish it again.` } as ApiError;
    }
    const currentBom = await fetchBom(targetBomId);
    if (path.length > 0 && isBoughtAssembly(currentBom)) {
        bought?.set(targetBomId, currentBom);
        return [[targetBomId, multiplier]];
    }
    const subPath = [...path, targetBomId];
    const subLists = await Promise.all(
        (currentBom.subAssemblies || []).map((sub) => collectBomParts(fetchBom, sub.bomID, (sub.quantity ?? 1) * multiplier, subPath, bought))
    );
    const ownParts = (currentBom.parts || []).map((p): [string, number] => [p.partID, (p.quantity ?? 1) * multiplier]);
    return [...subLists.flat(), ...ownParts];
}
