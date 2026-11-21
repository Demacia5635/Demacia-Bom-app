/**
 * How the panel sends its Onshape and database requests: at most N at a
 * time (createLimiter), each asked once per load (createCachedSources), and
 * stopped when the load is replaced or the panel closes (LOAD_CANCELLED).
 */
import type { ApiError } from "../util/ApiService";
import type { BomModel, PartModel } from "../util/Models";
import { getBomByOnshapeKey, getOnshapeBom, getPartByOnshapeKey, type OnshapeKey } from "./BomApi";
import type { OnshapeBomTable } from "./OnshapeBom";
import { keyString } from "./onshapeKeys";

/** Runs a network request, possibly waiting for a free slot first. */
export type Limiter = <T>(request: () => Promise<T>) => Promise<T>;

/** Where the tree's Onshape and database data comes from. */
export interface TreeSources {
  /**
   * The assembly's Onshape BOM. Only the top assembly is fetched multi-level
   * (its item count is the load's progress total); a sub-assembly's own items
   * are all the walk reads, so its BOM is fetched single-level.
   */
  onshapeBom(key: OnshapeKey, multiLevel?: boolean): Promise<OnshapeBomTable>;
  dbBom(key: OnshapeKey, bomID: string): Promise<BomModel>;
  dbPart(key: OnshapeKey, partID: string): Promise<PartModel>;
}

export const directSources: TreeSources = {
  onshapeBom: (key, multiLevel = false) => getOnshapeBom(key, multiLevel),
  dbBom: getBomByOnshapeKey,
  dbPart: getPartByOnshapeKey,
};

/**
 * A database record, or null when it isn't saved (the server answers 404).
 * Any other failure (server down, 502, timeout) is thrown: treating it as "not
 * saved" would drop the saved file IDs, so the next Publish BOM would
 * overwrite the record and leave its Drive files orphaned.
 */
export async function recordOrNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (err) {
    if ((err as ApiError)?.statusCode === 404) return null;
    throw err;
  }
}

/**
 * Per-load cache in front of the network: each BOM / record is requested once
 * (at most `limit` requests at a time), and asking again returns the same
 * promise. Lets a parallel prefetch run ahead of the in-order tree walk.
 * A failed request is dropped from the cache, so asking again retries it.
 */
export function createCachedSources(limit: Limiter): TreeSources {
  const cache = new Map<string, Promise<unknown>>();
  const once = <T,>(cacheKey: string, request: () => Promise<T>): Promise<T> => {
    let p = cache.get(cacheKey) as Promise<T> | undefined;
    if (!p) {
      p = limit(request);
      const pending = p;
      cache.set(cacheKey, pending);
      // Failures are handled by whoever awaits it. Forget a failed request so
      // the next ask retries instead of reusing the rejection for the whole load.
      pending.catch(() => {
        if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
      });
    }
    return p;
  };
  return {
    onshapeBom: (key, multiLevel = false) =>
      once(`bom:${multiLevel ? "multi" : "single"}:${keyString(key)}`, () => getOnshapeBom(key, multiLevel)),
    dbBom: (key, bomID) => once(`dbBom:${keyString(key)}/${bomID}`, () => getBomByOnshapeKey(key, bomID)),
    dbPart: (key, partID) => once(`dbPart:${keyString(key)}/${partID}`, () => getPartByOnshapeKey(key, partID)),
  };
}

/** Thrown instead of starting a request for a load that was replaced (see createLimiter). */
export const LOAD_CANCELLED = { message: "This load was replaced by a newer one.", cancelled: true } as const;

/**
 * At most `max` requests at once; the rest wait their turn. Applied to single
 * network calls (never to work that itself waits on other requests), so it
 * can't deadlock. Once `isCancelled()` is true, requests still waiting are
 * refused (LOAD_CANCELLED) instead of being sent.
 */
export function createLimiter(max: number, isCancelled?: () => boolean): Limiter {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (request) => {
    // Take a free slot, or wait until a finishing request hands its slot over.
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      if (isCancelled?.()) throw LOAD_CANCELLED;
      return await request();
    } finally {
      const next = waiting.shift();
      if (next) next(); // the slot passes straight to the next request
      else active -= 1;
    }
  };
}
