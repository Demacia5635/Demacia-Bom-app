/**
 * Records the extension's Onshape footprint for the website's unlisted /tele
 * page: every Onshape request is counted by kind and grouped into operations
 * ("Refresh BOM", "Publish BOM", ...). Requests made outside an operation
 * (mostly table images loading) are summed into periodic "Image loads" /
 * "Other" entries. Events are sent to our server in small batches.
 *
 * Telemetry never breaks the panel: every failure here is swallowed.
 */

export type OnshapeCallKind =
  | "bom"
  | "metadataRead"
  | "metadataWrite"
  | "render"
  | "stl"
  | "parasolid"
  | "session"
  | "modelCheck"
  | "other";

/** What one Onshape request is, from its method and path. */
export function classifyOnshapeCall(method: string, pathOrUrl: string): OnshapeCallKind {
  const path = pathOrUrl.replace(/^https?:\/\/[^/]+/, "");
  if (/\/shadedviews|\/thumbnails\//.test(path)) return "render";
  if (/\/stl(\?|$)/.test(path)) return "stl";
  if (/\/parasolid(\?|$)/.test(path)) return "parasolid";
  if (/\/bom(\?|$)/.test(path)) return "bom";
  if (/\/metadata\//.test(path)) return method.toUpperCase() === "GET" ? "metadataRead" : "metadataWrite";
  if (/\/users\/sessioninfo/.test(path)) return "session";
  if (/\/documents\/d\/[^/]+\/w\/[^/]+\/elements(\?|$)/.test(path)) return "modelCheck";
  return "other";
}

interface TelemetryEventData {
  at: string;
  user: string;
  action: string;
  assembly: string;
  documentID: string;
  elementID: string;
  counts: Partial<Record<OnshapeCallKind, number>>;
  failed: number;
  durationMs: number;
  ok: boolean;
  error: string;
  version: string;
}

interface Operation {
  action: string;
  assembly: string;
  documentID: string;
  elementID: string;
  counts: Partial<Record<OnshapeCallKind, number>>;
  failed: number;
  startedAt: number;
}

const FLUSH_INTERVAL_MS = 15_000;
const MAX_BATCH = 100;

let user = "";
let currentAssembly = { name: "", documentID: "", elementID: "" };
/**
 * Operations still running, oldest first. Operations can overlap (e.g. "Check
 * for model changes" during a Refresh) and the browser can't tell which one a
 * request belongs to, so a request is counted into the newest one still
 * running. A finished operation never collects more requests.
 */
const active: Operation[] = [];
/** Requests outside an operation, summed until the next flush. */
let ambient: Operation | null = null;
const queue: TelemetryEventData[] = [];

function version(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "";
  }
}

/** The Onshape account using the extension (from the sign-in check). */
export function setTelemetryUser(name: string): void {
  user = name;
}

/** The assembly the panel is showing, used to label operations and image loads. */
export function setTelemetryAssembly(name: string, documentID = "", elementID = ""): void {
  currentAssembly = { name, documentID, elementID };
  const current = active[active.length - 1];
  if (current) {
    current.assembly = name || current.assembly;
    current.documentID = documentID || current.documentID;
    current.elementID = elementID || current.elementID;
  }
}

function newOperation(action: string): Operation {
  return {
    action,
    assembly: currentAssembly.name,
    documentID: currentAssembly.documentID,
    elementID: currentAssembly.elementID,
    counts: {},
    failed: 0,
    startedAt: Date.now(),
  };
}

/** Counts one Onshape request (call it for every request, success or not). */
export function recordOnshapeCall(method: string, pathOrUrl: string, ok = true): void {
  try {
    const kind = classifyOnshapeCall(method, pathOrUrl);
    const op = active[active.length - 1] ?? (ambient ??= newOperation("Background"));
    op.counts[kind] = (op.counts[kind] ?? 0) + 1;
    if (!ok) op.failed += 1;
  } catch {
    /* never break the panel */
  }
}

function toEvent(op: Operation, ok: boolean, error: string): TelemetryEventData {
  return {
    at: new Date(op.startedAt).toISOString(),
    user,
    action: op.action,
    assembly: op.assembly,
    documentID: op.documentID,
    elementID: op.elementID,
    counts: { ...op.counts }, // a copy: the queued event must not change later
    failed: op.failed,
    durationMs: Date.now() - op.startedAt,
    ok,
    error,
    version: version(),
  };
}

/**
 * Runs `fn` as one named operation: Onshape requests made meanwhile are
 * counted into it, and one event is queued when it ends.
 */
export async function withOperation<T>(action: string, fn: () => Promise<T>): Promise<T> {
  const op = newOperation(action);
  active.push(op);
  let ok = true;
  let error = "";
  try {
    const result = await fn();
    if (result === null) ok = false; // loadTree returns null on failure
    return result;
  } catch (err: any) {
    ok = false;
    error = String(err?.message || err).slice(0, 500);
    throw err;
  } finally {
    active.splice(active.indexOf(op), 1);
    if (Object.keys(op.counts).length > 0 || !ok) queue.push(toEvent(op, ok, error));
    scheduleFlush();
  }
}

/** Moves the summed background requests into the queue as their own entries. */
function drainAmbient(): void {
  if (!ambient) return;
  const op = ambient;
  ambient = null;
  // Split images from the rest, so "Image loads" reads clearly on the page.
  const { render, ...rest } = op.counts;
  if (render) queue.push(toEvent({ ...op, action: "Image loads", counts: { render } }, true, ""));
  if (Object.keys(rest).length > 0) queue.push(toEvent({ ...op, action: "Other Onshape calls", counts: rest }, true, ""));
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

/** Sends queued events to the server. `keepalive` lets it finish while the panel closes. */
export async function flush(keepalive = false): Promise<void> {
  drainAmbient();
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    const res = await fetch(`${import.meta.env.VITE_CLIENT_URL}/api/telemetry/events`, {
      method: "POST",
      keepalive,
      headers: {
        "Content-Type": "application/json",
        "x-client-secret": import.meta.env.VITE_CLIENT_SECRET ?? "",
      },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    // Put them back for the next try (bounded, so a dead server can't grow it forever).
    if (!keepalive && queue.length < 1000) queue.unshift(...batch);
  }
  if (queue.length > 0 && !keepalive) scheduleFlush();
}

// Background requests (image loads) are flushed on the same timer.
setInterval(() => {
  if (ambient) void flush();
}, FLUSH_INTERVAL_MS);

// Send what's left when the panel closes.
addEventListener("pagehide", () => void flush(true));
