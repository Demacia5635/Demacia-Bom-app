/**
 * Turns an error thrown while publishing into plain words: what likely went
 * wrong and what to do next. Errors come from the BOM server (ApiService:
 * `{ message, statusCode? }`, no status = never reached it) or from Onshape
 * (onshapeDirect: `source: "onshape"`, `onshapeStatus` 0 = never reached it).
 */
import { ApiRequestError } from "../util/ApiService";
export interface PublishErrorExplanation {
  /** The likely cause, as a sentence. */
  cause: string;
  /** What the user should do next, as a sentence. */
  next: string;
  /** The raw message, for the details in parentheses. */
  detail: string;
}

const RETRY = "Press Publish BOM again to retry.";

export function explainPublishError(err: unknown): PublishErrorExplanation {
  const e = (err ?? {}) as { message?: unknown; statusCode?: unknown; source?: unknown; onshapeStatus?: unknown };
  const detail = typeof e.message === "string" && e.message ? e.message : String(err);

  if (e.source === "onshape") {
    const status = typeof e.onshapeStatus === "number" ? e.onshapeStatus : 0;
    if (status === 0)
      return { cause: "Onshape could not be reached.", next: `Check your internet connection, then ${lowerFirst(RETRY)}`, detail };
    if (status === 401 || status === 403)
      return {
        cause: "Onshape refused the request (no permission).",
        next: "Make sure you are signed in to Onshape in this browser and can edit this document, then publish again.",
        detail,
      };
    if (status === 404)
      return {
        cause: "Onshape could not find an item: it may have been deleted, moved or changed since the BOM was loaded.",
        next: "Press Refresh BOM, then publish again.",
        detail,
      };
    if (status === 429)
      return { cause: "Onshape is limiting how many requests we send.", next: `Wait a minute, then ${lowerFirst(RETRY)}`, detail };
    return { cause: `Onshape returned an error (${status}).`, next: RETRY, detail };
  }

  const status = typeof e.statusCode === "number" ? e.statusCode : 0;
  if (status === 0) {
    // A request to our server that never got an answer (fetchFromApi throws an
    // ApiRequestError without a status) is the server being unreachable; any
    // other Error is the extension's own.
    if (err instanceof Error && !(err instanceof ApiRequestError))
      return { cause: "Something went wrong in the extension.", next: RETRY, detail };
    return {
      cause: "The BOM server could not be reached (you may be offline, or it may be starting up).",
      next: `Check your internet connection, wait a few seconds, then ${lowerFirst(RETRY)}`,
      detail,
    };
  }
  if (status === 401 || status === 403)
    return {
      cause: "The BOM server refused the extension's access key.",
      next: "Update the extension to the latest version; if it keeps happening, tell the team.",
      detail,
    };
  if (status === 404)
    return {
      cause: "The BOM server could not find a saved record, or this action.",
      next: "Press Refresh BOM, then publish again. If it keeps happening, update the extension.",
      detail,
    };
  if (status === 409)
    return { cause: "Someone else saved the same item at the same moment.", next: RETRY, detail };
  if (status >= 400 && status < 500)
    return {
      cause: "The BOM server rejected the save because a value isn't valid.",
      next: "Fix the value named in the details, then publish again.",
      detail,
    };
  return {
    cause: `The BOM server failed while saving (${status}).`,
    next: `${RETRY} If it keeps failing, tell the team.`,
    detail,
  };
}

/** One line: cause, next step, and the raw message in parentheses. */
export function describePublishError(err: unknown): string {
  const { cause, next, detail } = explainPublishError(err);
  return `${cause} ${next} (Details: ${detail})`;
}

/** "Saving the assembly" -> "saving the assembly", to use mid-sentence. */
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
