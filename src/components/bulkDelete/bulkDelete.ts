import { ApiRequestError } from "../../util/ApiService";

/**
 * Admin deletes in batches (/orphans parts, /files Drive files): the server
 * takes at most 200 ids per request and re-checks each one, answering which
 * were deleted and which refused (with a reason).
 */

/** The server takes at most this many ids per delete. */
export const DELETE_BATCH = 200;

export interface DeleteOutcome {
  /** Deleted id → files moved to the Drive trash with it (0 when it is a file itself). */
  deleted: Map<string, number>;
  /** Refused id → the server's reason. */
  refused: Map<string, string>;
  /** Set when it stopped early (wrong secret, too many tries, network); the rest weren't tried. */
  stopped: string | null;
  /** What stopped it. */
  error: unknown;
}

/** One batch's answer, in the page's terms. */
export interface BatchResult {
  deleted: [id: string, files: number][];
  refused: [id: string, reason: string][];
}

/** `items` in chunks of `size`, in order. */
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
 * Sends `ids` 200 at a time, one batch after another. Stops at the first
 * failed batch; what earlier batches deleted stays deleted. An id the server
 * doesn't mention counts as refused.
 */
export async function runDeleteBatches(
  ids: string[],
  sendBatch: (batch: string[]) => Promise<BatchResult>,
  onProgress?: (done: number, total: number) => void,
): Promise<DeleteOutcome> {
  const outcome: DeleteOutcome = { deleted: new Map(), refused: new Map(), stopped: null, error: null };
  let done = 0;
  onProgress?.(0, ids.length);
  for (const batch of chunks(ids)) {
    try {
      const result = await sendBatch(batch);
      for (const [id, files] of result.deleted) outcome.deleted.set(id, files);
      for (const [id, reason] of result.refused) outcome.refused.set(id, reason);
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
