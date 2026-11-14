/**
 * Loads many parts / assemblies at once (one request), instead of one request
 * per item. Uses the server's read-only batch lookup (POST /db/part/ids,
 * /db/bom/ids); if the server doesn't have it yet, falls back to the single
 * lookups, 8 at a time.
 */
import { fetchFromApi } from "./ApiService";
import type { BomModel, PartModel } from "./Models";

const FALLBACK_CONCURRENCY = 8;
const BATCH_SIZE = 500;

async function fetchByIds<T extends { id: string }>(kind: "part" | "bom", ids: string[]): Promise<Map<string, T>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const found = new Map<string, T>();
  if (unique.length === 0) return found;

  try {
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const records = await fetchFromApi<T[]>(`/db/${kind}/ids`, {
        method: "POST",
        body: JSON.stringify({ ids: unique.slice(i, i + BATCH_SIZE) }),
      });
      for (const r of records ?? []) found.set(r.id, r);
    }
    return found;
  } catch (err: any) {
    // Only fall back when the server doesn't know the batch route yet.
    if (err?.statusCode !== 404) throw err;
  }

  const queue = [...unique];
  await Promise.all(
    Array.from({ length: Math.min(FALLBACK_CONCURRENCY, queue.length) }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const record = await fetchFromApi<T>(`/db/${kind}/id/${encodeURIComponent(id)}`).catch(() => null);
        if (record) found.set(id, record);
      }
    })
  );
  return found;
}

/** Parts by ID (missing ones are simply absent from the map). */
export function fetchPartsByIds(ids: string[]): Promise<Map<string, PartModel>> {
  return fetchByIds<PartModel>("part", ids);
}

/** Assemblies by ID (missing ones are simply absent from the map). */
export function fetchBomsByIds(ids: string[]): Promise<Map<string, BomModel>> {
  return fetchByIds<BomModel>("bom", ids);
}
