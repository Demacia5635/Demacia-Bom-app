/**
 * Keeps Onshape-rendered images (part and assembly views) in the browser's
 * Cache Storage, so reopening an assembly doesn't render them again - unless
 * the model changed.
 *
 * Each image is stored with a "version": the change marker (microversion) of
 * the Onshape tab its model lives in. Before images load, the panel registers
 * the current version of every image URL (see setImageVersions). A stored
 * image is used only when its version matches; otherwise it's rendered by
 * Onshape again and stored with the new version. Images with no known
 * version are never cached.
 */

const CACHE_NAME = "demacia-bom-images-v1";
const VERSION_HEADER = "x-model-version";
/** When the image was stored (ms since epoch), for trimming. */
const STORED_AT_HEADER = "x-stored-at";
/** Images older than this are removed (re-rendered when next needed). */
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
/** Most images kept; the oldest beyond this are removed. */
const MAX_ENTRIES = 3000;
/** Trim this long after the first image is stored in a session. */
const TRIM_DELAY_MS = 5000;
/** Longest an image waits for the version check before rendering anyway. */
const VERSION_WAIT_MS = 8000;

let versions = new Map<string, string>();
let ready: Promise<void> = Promise.resolve();
let markReady: (() => void) | null = null;

/** Synthetic cache key for an image URL (Cache Storage needs an http(s) URL). */
const cacheKey = (url: string) => `https://image-cache.demacia-bom.invalid/?u=${encodeURIComponent(url)}`;

/**
 * Call before rows with Onshape images are shown: images then wait (briefly)
 * for setImageVersions instead of rendering straight away.
 */
export function beginImageVersionCheck(): void {
  if (markReady) return; // already waiting
  ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
}

/** Current model version of each image URL (missing = don't cache that image). */
export function setImageVersions(next: Map<string, string>): void {
  versions = next;
  markReady?.();
  markReady = null;
}

/** Ends a check without versions (e.g. the check failed): images just render. */
export function cancelImageVersionCheck(): void {
  markReady?.();
  markReady = null;
}

async function versionFor(url: string): Promise<string | null> {
  await Promise.race([ready, new Promise((r) => setTimeout(r, VERSION_WAIT_MS))]);
  return versions.get(url) ?? null;
}

/** The stored image for `url` if its model hasn't changed since; null otherwise. */
export async function getCachedImage(url: string): Promise<Blob | null> {
  try {
    const version = await versionFor(url);
    if (!version) return null;
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKey(url));
    if (!hit || hit.headers.get(VERSION_HEADER) !== version) return null;
    return await hit.blob();
  } catch {
    return null;
  }
}

/** Stores a freshly rendered image with its model's current version. */
export async function putCachedImage(url: string, blob: Blob): Promise<void> {
  try {
    const version = versions.get(url);
    if (!version) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      cacheKey(url),
      new Response(blob, {
        headers: {
          "Content-Type": blob.type || "image/png",
          [VERSION_HEADER]: version,
          [STORED_AT_HEADER]: String(Date.now()),
        },
      })
    );
    scheduleTrim();
  } catch {
    /* caching is best-effort */
  }
}

let trimScheduled = false;
/** Trims once per session, shortly after images start being stored. */
function scheduleTrim(): void {
  if (trimScheduled) return;
  trimScheduled = true;
  setTimeout(() => void trimImageCache(), TRIM_DELAY_MS);
}

/**
 * Every new image URL (other configurations, versions, documents) adds an
 * entry, so without this the cache only grows. Removes images older than
 * MAX_AGE_MS, then the oldest beyond MAX_ENTRIES. Entries stored before the
 * stored-at header existed count as oldest for the count limit, but aren't
 * removed by age: dropping them all at once would re-render every image (and
 * spend Onshape API calls) the first time this runs.
 */
export async function trimImageCache(now: number = Date.now()): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    const entries: { request: Request; storedAt: number }[] = [];
    for (const request of requests) {
      const res = await cache.match(request);
      entries.push({ request, storedAt: Number(res?.headers.get(STORED_AT_HEADER)) || 0 });
    }
    entries.sort((a, b) => b.storedAt - a.storedAt); // newest first
    const tooOld = (e: { storedAt: number }) => e.storedAt > 0 && now - e.storedAt > MAX_AGE_MS;
    const remove = entries.filter((e, i) => i >= MAX_ENTRIES || tooOld(e));
    for (const e of remove) await cache.delete(e.request);
  } catch {
    /* best-effort */
  }
}
