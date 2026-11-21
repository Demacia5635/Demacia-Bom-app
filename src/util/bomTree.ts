/**
 * One way to load a BOM's whole tree, and pure functions over it, for every
 * page that walks an assembly: the BOM page (its views), the work-order page
 * (its parts and totals) and creating a work order (the same parts, and the
 * catalog-number check). Loading is one batch request per level of
 * sub-assemblies, then one for all the parts; a sub-assembly used in several
 * places is loaded once.
 */
import { ApiRequestError, fetchFromApi } from "./ApiService";
import type { CatalogNode } from "./catalogNumbers";
import { isPurchasedPart, type BomModel, type PartModel } from "./Models";
import { fetchBomsByIds, fetchPartsByIds } from "./records";

/** A BOM with every sub-assembly under it, and all their parts. */
export interface BomTree {
  rootId: string;
  root: BomModel;
  /** Every sub-assembly found under the root (not the root itself). */
  boms: Map<string, BomModel>;
  parts: Map<string, PartModel>;
}

/**
 * A sub-assembly bought whole (marked standard in the extension, or with a
 * vendor): a work order lists it as one purchased line, not the parts inside,
 * and the catalog-number check skips it.
 */
export function isBoughtAssembly(bom: Pick<BomModel, "markedStandard" | "vendor"> | null | undefined): boolean {
  return !!bom?.markedStandard || !!bom?.vendor?.trim();
}

/**
 * Loads a BOM's whole tree (in one request from the server's tree route,
 * else level by level). `onRoot` gets the root BOM as soon as it's loaded
 * (the BOM page's header shows it while the rest loads). Sub-assemblies missing
 * from the database are simply absent from `boms`.
 */
export async function loadBomTree(rootId: string, onRoot?: (root: BomModel) => void): Promise<BomTree> {
  // One request when the server has the tree route (GET /db/bom/tree/:id).
  try {
    const reply = await fetchFromApi<TreeReply>(`/db/bom/tree/${encodeURIComponent(rootId)}`);
    const root = reply.boms.find((b) => b.id === reply.rootID);
    if (root && !reply.truncated) {
      onRoot?.(root);
      const boms = new Map(reply.boms.filter((b) => b.id !== reply.rootID).map((b) => [b.id, b] as const));
      const parts = new Map(reply.parts.map((p) => [p.id, p] as const));
      return { rootId, root, boms, parts };
    }
    // A tree too big for the route (truncated): loaded level by level below.
  } catch (err: any) {
    // 404: a server without the route (or no such BOM, which the loader below reports).
    if (err?.statusCode !== 404) throw err;
  }
  return loadBomTreeByLevel(rootId, onRoot);
}

/** The tree route's reply (server/API.md). */
interface TreeReply {
  rootID: string;
  boms: BomModel[];
  parts: PartModel[];
  missing?: { boms: string[]; parts: string[] };
  truncated?: boolean;
}

/** Loads the tree one batch request per level, then one for all the parts. */
async function loadBomTreeByLevel(rootId: string, onRoot?: (root: BomModel) => void): Promise<BomTree> {
  const root = await fetchFromApi<BomModel>(`/db/bom/id/${encodeURIComponent(rootId)}`);
  onRoot?.(root);
  const boms = new Map<string, BomModel>();
  const tried = new Set<string>([rootId]);
  let level: BomModel[] = [root];

  while (level.length > 0) {
    const next = [...new Set(level.flatMap((b) => (b.subAssemblies || []).map((s) => s.bomID)))]
      .filter((id) => id && !tried.has(id));
    next.forEach((id) => tried.add(id));
    const found = await fetchBomsByIds(next);
    found.forEach((bom, id) => boms.set(id, bom));
    level = [...found.values()];
  }

  const partIds = [root, ...boms.values()].flatMap((b) => (b.parts || []).map((p) => p.partID));
  const parts = await fetchPartsByIds(partIds);
  return { rootId, root, boms, parts };
}

/** A BOM of the tree by id (the root included). */
export function bomOf(tree: BomTree, id: string): BomModel | undefined {
  return id === tree.rootId ? tree.root : tree.boms.get(id);
}

/**
 * The work-order lines of the tree: every part with its total quantity for one
 * root assembly (each quantity multiplied by those of the sub-assemblies above
 * it, and added up where a part or a whole sub-assembly appears several
 * times), in first-seen order with sub-assemblies before a BOM's own parts. A
 * bought sub-assembly (isBoughtAssembly) is one line by its BOM id, not looked
 * inside, and its record goes into `bought`. The root is always opened.
 * Throws if an assembly contains itself, or a sub-assembly isn't saved.
 */
export function workOrderLines(tree: BomTree): { totals: Map<string, number>; bought: Map<string, BomModel> } {
  const totals = new Map<string, number>();
  const bought = new Map<string, BomModel>();
  const add = (id: string, quantity: number) => totals.set(id, (totals.get(id) || 0) + quantity);

  const walk = (bomId: string, multiplier: number, path: string[]) => {
    if (path.includes(bomId)) {
      throw new ApiRequestError(`Assembly ${bomId} contains itself (via ${path.join(" > ")}). Fix the BOM and publish it again.`);
    }
    const bom = bomOf(tree, bomId);
    if (!bom) throw new ApiRequestError(`Assembly ${bomId} isn't saved in the database. Publish the BOM again.`, 404);
    if (path.length > 0 && isBoughtAssembly(bom)) {
      bought.set(bomId, bom);
      add(bomId, multiplier);
      return;
    }
    const subPath = [...path, bomId];
    for (const sub of bom.subAssemblies || []) walk(sub.bomID, (sub.quantity ?? 1) * multiplier, subPath);
    for (const p of bom.parts || []) add(p.partID, (p.quantity ?? 1) * multiplier);
  };

  walk(tree.rootId, 1, []);
  return { totals, bought };
}

/**
 * The tree for the catalog-number check (util/catalogNumbers.ts): every
 * assembly and part with its number, a shared sub-assembly checked once, bought
 * items exempt. `names` maps each id to the name to show in a problem.
 */
export function catalogTree(tree: BomTree): { root: CatalogNode; names: Map<string, string> } {
  const names = new Map<string, string>();
  const seen = new Set<string>();

  const node = (bom: BomModel): CatalogNode => {
    const subIds = [...new Set((bom.subAssemblies || []).map((sub) => sub.bomID).filter((id) => !seen.has(id)))];
    subIds.forEach((id) => seen.add(id));
    const children: CatalogNode[] = [];
    for (const id of subIds) {
      const sub = tree.boms.get(id);
      if (sub) children.push(node(sub));
    }
    for (const p of bom.parts || []) {
      const part = tree.parts.get(p.partID) ?? null;
      const name = part?.name || p.partID;
      names.set(p.partID, name);
      children.push({ id: p.partID, name, number: part?.catalogNumber || "", isAssembly: false, exempt: isPurchasedPart(part), children: [] });
    }
    const name = bom.name || bom.id;
    names.set(bom.id, name);
    return {
      id: bom.id,
      name,
      number: bom.catalogNumber || "",
      isAssembly: true,
      exempt: bom.id !== tree.rootId && isBoughtAssembly(bom),
      children,
    };
  };

  return { root: node(tree.root), names };
}
