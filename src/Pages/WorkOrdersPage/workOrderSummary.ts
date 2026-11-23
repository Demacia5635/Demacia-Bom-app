import { fetchFromApi } from "../../util/ApiService";

/**
 * One work order's progress, from GET /db/workOrder/summary (server/API.md).
 * It counts the same way as the work-order page: made = not purchased and
 * not untracked; finished = "Finished Manufacturing" or priority "Finished".
 */
export interface WorkOrderSummary {
  id: string;
  lines?: number;
  trackedParts?: number;
  madeParts?: number;
  finishedParts?: number;
  madeQty?: number;
  finishedQty?: number;
  totalQty?: number;
  byStatus?: Record<string, number>;
  updatedAt?: string;
  /** Why the counts couldn't be made (the work-order page's message). */
  error?: string;
}

/** Every work order's summary by id, or null when the server doesn't have the route yet. */
export async function loadWorkOrderSummaries(): Promise<Map<string, WorkOrderSummary> | null> {
  try {
    const list = await fetchFromApi<WorkOrderSummary[]>("/db/workOrder/summary");
    return new Map((list || []).map((s) => [s.id, s] as const));
  } catch {
    return null; // an older server (404) or offline: the list just shows no progress
  }
}

/** Whether a work order still has parts to make (unknown: false). */
export const hasUnfinishedParts = (summary: WorkOrderSummary | undefined): boolean =>
  !!summary && !summary.error && (summary.finishedParts ?? 0) < (summary.madeParts ?? 0);
