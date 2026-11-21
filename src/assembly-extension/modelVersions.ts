/**
 * Which version of its Onshape model each row shows: decides whether saved
 * files, sizes and row images are still current.
 */
import type AssemblyBomRow from "./AssemblyBomRow";
import { getElementMicroversions } from "../extension/onshapeDirect";
import type { Limiter } from "./requestPool";

/** Short, stable fingerprint of a string (FNV-1a), for version keys. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/** Model version of each row (by row ID), and of the whole tree. */
export interface ModelVersions {
  /** Parts: their Part Studio's change marker; null when unknown. */
  byRow: Map<string, string | null>;
  /** Fingerprint of every marker in the tree (assembly pictures show parts from across it). */
  tree: string | null;
}

/**
 * Current model versions for a tree: one request per document workspace in
 * it for its tabs' change markers (versions and microversions never change).
 */
export async function computeModelVersions(rows: AssemblyBomRow[], limit: Limiter): Promise<ModelVersions> {
  const workspaces = new Map<string, Promise<Map<string, string> | null>>();
  for (const r of rows) {
    const key = `${r.documentID}/${r.wvmID}`;
    if (r.wvmType === "w" && !workspaces.has(key)) {
      workspaces.set(key, limit(() => getElementMicroversions(r.documentID, r.wvmID)).catch(() => null));
    }
  }
  const markers = new Map<string, Map<string, string> | null>();
  for (const [key, request] of workspaces) markers.set(key, await request);

  const modelVersion = (r: AssemblyBomRow): string | null =>
    r.wvmType !== "w"
      ? `${r.wvmType}:${r.wvmID}` // versions/microversions never change
      : markers.get(`${r.documentID}/${r.wvmID}`)?.get(r.elementID) ?? null;

  const byRow = new Map<string, string | null>(rows.map((r) => [r.id, modelVersion(r)]));
  const all = [...byRow.values()];
  const tree = all.every(Boolean) ? `tree:${fingerprint([...new Set(all)].sort().join(","))}` : null;
  return { byRow, tree };
}

/**
 * Version a part's saved files were made from: its model version plus its
 * configuration (a configured part's files depend on both). null when unknown.
 */
export function partFilesVersion(row: AssemblyBomRow, versions: ModelVersions): string | null {
  const model = versions.byRow.get(row.id);
  return model ? `${model}|${row.configuration ?? ""}` : null;
}

/**
 * The current model version of every row image, for the image store
 * (imageCache.ts). Parts use their Part Studio's marker; assemblies the tree
 * fingerprint. Images with an unknown version aren't stored.
 */
export async function computeImageVersions(rows: AssemblyBomRow[], limit: Limiter, known?: ModelVersions): Promise<Map<string, string>> {
  const { byRow, tree } = known ?? (await computeModelVersions(rows, limit));
  const versions = new Map<string, string>();
  for (const r of rows) {
    const version = r.isAssembly ? tree : byRow.get(r.id);
    if (r.avatar && version) versions.set(r.avatar, version);
  }
  return versions;
}
