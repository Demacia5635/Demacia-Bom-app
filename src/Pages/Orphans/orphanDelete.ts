import { fetchFromApi } from "../../util/ApiService";
import { runDeleteBatches, type DeleteOutcome } from "../../components/bulkDelete/bulkDelete";

export { adminErrorMessage, chunks, DELETE_BATCH, isSecretRejected, type DeleteOutcome } from "../../components/bulkDelete/bulkDelete";

export interface DeleteReply {
  deleted: { id: string; name?: string; catalogNumber?: string; filesTrashed?: string[] }[];
  refused: { id: string; reason: string }[];
}

/**
 * Deletes parts no assembly uses (server: POST /db/part/orphans/delete, which
 * checks each one again), 200 at a time; a deleted part's count is the Drive
 * files trashed with it.
 */
export function deleteOrphans(ids: string[], secret: string, onProgress?: (done: number, total: number) => void): Promise<DeleteOutcome> {
  return runDeleteBatches(
    ids,
    async (batch) => {
      const reply = await fetchFromApi<DeleteReply>("/db/part/orphans/delete", {
        method: "POST",
        headers: { "x-admin-secret": secret },
        body: JSON.stringify({ ids: batch }),
      });
      return {
        deleted: (reply?.deleted ?? []).map((d) => [d.id, d.filesTrashed?.length ?? 0]),
        refused: (reply?.refused ?? []).map((r) => [r.id, r.reason]),
      };
    },
    onProgress,
  );
}
