import { fetchFromApi } from "../../util/ApiService";
import { progressOfSummary, type Progress } from "../../util/workOrderProgress";

/**
 * One work order's progress, from GET /db/workOrder/summary (server/API.md).
 * Its finished progress counts made and bought lines (`progress`, or the same
 * numbers from the older fields: workOrderProgress.ts), as the page does.
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
  purchased?: { lines: number; toBuy: number; finished: number; untracked: number };
  /** Finished of every followed line, made and bought (newer servers). */
  progress?: Progress;
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

/** Whether a work order still has parts to make or buy (unknown: false). */
export const hasUnfinishedParts = (summary: WorkOrderSummary | undefined): boolean => {
  if (!summary || summary.error) return false;
  const p = progressOfSummary(summary);
  return p.finished < p.total;
};
