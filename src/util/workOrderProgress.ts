/**
 * A work order's finished progress, the same everywhere the website shows it
 * (work-order page header, work-order list, #/production) and as the server
 * counts it (`progress` on GET /db/workOrder/summary and /admin/production):
 * - total: every line except "Untracked" ones (not followed: bought and not
 *   tracked, or made outside the team), made AND bought / standard lines;
 * - finished: status "Finished Manufacturing" (made) or "Finished" (bought),
 *   or priority "Finished";
 * - percent: rounded; 100 with nothing to follow.
 */
export interface Progress {
  finished: number;
  total: number;
  percent: number;
}

export function makeProgress(finished: number, total: number): Progress {
  return { finished, total, percent: total > 0 ? Math.round((finished / total) * 100) : 100 };
}

/** A line as the work-order page has it. */
export interface ProgressLine {
  statusCode?: string;
  Priority?: string;
}

export function isLineFinished(line: ProgressLine): boolean {
  return line.statusCode === "Finished Manufacturing" || line.statusCode === "Finished" || line.Priority === "Finished";
}

/** From the page's own lines. */
export function progressOfLines(lines: ProgressLine[]): Progress {
  const followed = lines.filter((l) => l.statusCode !== "Untracked");
  return makeProgress(followed.filter(isLineFinished).length, followed.length);
}

/** What a server summary / production order carries (older servers lack `progress`). */
export interface ProgressCounts {
  progress?: Progress;
  madeParts?: number;
  finishedParts?: number;
  purchased?: { lines: number; toBuy?: number; finished: number; untracked: number };
}

/** The server's `progress`, or the same numbers from its older fields. */
export function progressOfSummary(s: ProgressCounts): Progress {
  if (s.progress) return s.progress;
  const bought = s.purchased ?? { lines: 0, finished: 0, untracked: 0 };
  return makeProgress((s.finishedParts ?? 0) + bought.finished, (s.madeParts ?? 0) + bought.lines - bought.untracked);
}
