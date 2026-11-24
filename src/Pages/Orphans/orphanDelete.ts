import { ApiRequestError, fetchFromApi } from "../../util/ApiService";

/** The server takes at most this many ids per delete. */
export const DELETE_BATCH = 200;

export interface DeleteReply {
  deleted: { id: string; name?: string; catalogNumber?: string; filesTrashed?: string[] }[];
  refused: { id: string; reason: string }[];
}

export interface DeleteOutcome {
  /** Deleted part id → files moved to the Drive trash. */
  deleted: Map<string, number>;
  /** Refused part id → the server's reason. */
  refused: Map<string, string>;
  /** Set when it stopped early (wrong secret, too many tries, network); the rest weren't tried. */
  stopped: string | null;
}

/** `ids` in chunks of `size`, in order. */
export function chunks<T>(items: T[], size = DELETE_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The message for an admin request that failed: a wrong secret (404), the server's lock-out (429), or anything else. */
export function adminErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError && err.statusCode === 404) return "Wrong admin secret.";
  if (err instanceof ApiRequestError && err.statusCode === 429) {
    return err.message || "Too many wrong admin secrets. Try again in 15 minutes.";
  }
  return `Couldn't delete: ${(err as Error)?.message || err}`;
}

/** Whether the failure means the secret itself wasn't accepted (so it shouldn't be kept). */
export function isSecretRejected(err: unknown): boolean {
  return err instanceof ApiRequestError && err.statusCode === 404;
}

/**
 * Deletes `ids` (server: POST /db/part/orphans/delete, which checks each one
 * again), 200 at a time, one batch after another. Stops at the first failed
 * batch; what was deleted before it stays deleted.
 */
export async function deleteOrphans(
  ids: string[],
  secret: string,
  onProgress?: (done: number, total: number) => void,
): Promise<DeleteOutcome & { error: unknown }> {
  const outcome: DeleteOutcome & { error: unknown } = { deleted: new Map(), refused: new Map(), stopped: null, error: null };
  let done = 0;
  onProgress?.(0, ids.length);
  for (const batch of chunks(ids)) {
    try {
      const reply = await fetchFromApi<DeleteReply>("/db/part/orphans/delete", {
        method: "POST",
        headers: { "x-admin-secret": secret },
        body: JSON.stringify({ ids: batch }),
      });
      for (const d of reply?.deleted ?? []) outcome.deleted.set(d.id, d.filesTrashed?.length ?? 0);
      for (const r of reply?.refused ?? []) outcome.refused.set(r.id, r.reason);
      // Anything the server didn't mention wasn't deleted.
      for (const id of batch) if (!outcome.deleted.has(id) && !outcome.refused.has(id)) outcome.refused.set(id, "the server didn't delete it");
    } catch (err) {
      outcome.stopped = adminErrorMessage(err);
      outcome.error = err;
      break;
    }
    done += batch.length;
    onProgress?.(done, ids.length);
  }
  return outcome;
}
