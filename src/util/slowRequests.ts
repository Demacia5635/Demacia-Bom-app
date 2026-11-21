/**
 * Tells the user what they're waiting for when a request takes more than a
 * few seconds ("Loading parts from the server... 7 s"), including the free
 * Render server waking up. Install once per app with installRequestTracking();
 * render <SlowRequestNotice /> (SlowRequestNotice.tsx) once.
 *
 * It wraps window.fetch, so every request is covered without changing each
 * call site. Requests the user isn't waiting on (table images, telemetry) are
 * ignored.
 */
type Target = "server" | "onshape";

export interface PendingRequest {
  target: Target;
  label: string;
  startedAt: number;
}

const pending = new Map<number, PendingRequest>();
let nextId = 1;
let installed = false;

/** What a request is, for the user; null for requests nobody is waiting on. */
function describe(url: string, method: string): PendingRequest | null {
  let u: URL;
  try {
    u = new URL(url, window.location.href);
  } catch {
    return null;
  }
  const path = u.pathname;
  const now = Date.now();

  if (/(^|\.)onshape\.com$/.test(u.hostname)) {
    if (/\/shadedviews|\/thumbnails\//.test(path)) return null; // images show their own "Loading..."
    let label = "Talking to Onshape";
    if (/\/bom(\/|$)/.test(path)) label = "Reading the BOM from Onshape";
    else if (/\/stl$/.test(path)) label = "Exporting an STL from Onshape";
    else if (/\/parasolid$/.test(path)) label = "Exporting a Parasolid from Onshape";
    else if (/\/metadata\//.test(path)) label = method === "GET" ? "Reading properties from Onshape" : "Saving properties to Onshape";
    else if (/\/users\/sessioninfo/.test(path)) label = "Checking your Onshape sign-in";
    return { target: "onshape", label, startedAt: now };
  }

  if (!path.startsWith("/api/")) return null;
  if (path.startsWith("/api/telemetry")) return null; // background, nobody waits on it
  if (method === "GET" && path.startsWith("/api/drive/file/id/")) return null; // images
  let label = "Waiting for the server";
  if (path.startsWith("/api/drive/file/")) label = method === "DELETE" ? "Removing an old file from Google Drive" : "Uploading a file to Google Drive";
  else if (path.startsWith("/api/db/part")) label = method === "GET" ? "Loading parts from the database" : "Saving a part to the database";
  else if (path.startsWith("/api/db/bom")) label = method === "GET" ? "Loading assemblies from the database" : "Saving an assembly to the database";
  else if (path.startsWith("/api/db/workOrder")) label = method === "GET" ? "Loading work orders" : "Saving the work order";
  return { target: "server", label, startedAt: now };
}

/** Wraps window.fetch once so every request is tracked. */
export function installRequestTracking(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const info = init?.keepalive ? null : describe(url, method);
    if (!info) return original(input, init);
    const id = nextId++;
    pending.set(id, info);
    return original(input, init).finally(() => pending.delete(id));
  };
}

/** The tracked requests still running (read by SlowRequestNotice). */
export function pendingRequests(): PendingRequest[] {
  return [...pending.values()];
}
