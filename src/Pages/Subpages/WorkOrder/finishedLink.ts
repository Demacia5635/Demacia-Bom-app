/**
 * A work-order line's finished status and priority "Finished" go together, in
 * both directions, so the page's finished counts (header, chips, "Hide
 * finished") and the server's summary agree with what the line shows:
 * - status set to finished ("Finished Manufacturing" made / "Finished"
 *   bought) → priority "Finished"; priority set to "Finished" → that status;
 * - status moved away from finished while the priority is "Finished" → the
 *   priority goes back to the default, "Medium";
 * - priority moved away from "Finished" while the status is finished → the
 *   status steps back: "In manufacturing" (made) / "To buy" (bought).
 */
export interface StatusAndPriority {
  statusCode: string;
  Priority: string;
}

export const DEFAULT_PRIORITY = "Medium";

export function finishedStatusFor(bought: boolean): string {
  return bought ? "Finished" : "Finished Manufacturing";
}

/** `next` with its status and priority kept in step after an edit from `old`. `bought`: the line after the edit. */
export function linkFinished(old: StatusAndPriority, next: StatusAndPriority, bought: boolean): StatusAndPriority {
  const finished = finishedStatusFor(bought);
  const statusChanged = old.statusCode !== next.statusCode;
  const priorityChanged = old.Priority !== next.Priority;
  const out = { statusCode: next.statusCode, Priority: next.Priority };

  if (statusChanged && next.statusCode === finished) {
    out.Priority = "Finished";
  } else if (priorityChanged && next.Priority === "Finished") {
    out.statusCode = finished;
  } else if (statusChanged && next.Priority === "Finished") {
    // No longer finished (or a status of the other list, e.g. set to Untracked).
    out.Priority = DEFAULT_PRIORITY;
  } else if (priorityChanged && old.Priority === "Finished" && next.statusCode === finished) {
    out.statusCode = bought ? "To buy" : "In manufacturing";
  }
  return out;
}
