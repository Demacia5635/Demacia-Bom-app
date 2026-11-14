/**
 * Tells the user what they're waiting for when a request takes more than a
 * few seconds ("Loading parts from the server... 7 s"), including the free
 * Render server waking up. Install once per app with installRequestTracking();
 * render <SlowRequestNotice /> once.
 *
 * It wraps window.fetch, so every request is covered without changing each
 * call site. Requests the user isn't waiting on (table images, telemetry) are
 * ignored.
 */
import { useEffect, useState } from "react";

type Target = "server" | "onshape";

interface Pending {
  target: Target;
  label: string;
  startedAt: number;
}

const pending = new Map<number, Pending>();
let nextId = 1;
let installed = false;

/** What a request is, for the user; null for requests nobody is waiting on. */
function describe(url: string, method: string): Pending | null {
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

/** The longest-running tracked request, once it's older than `thresholdMs`. */
function useSlowestRequest(thresholdMs: number): (Pending & { seconds: number }) | null {
  const [slowest, setSlowest] = useState<(Pending & { seconds: number }) | null>(null);
  useEffect(() => {
    const tick = () => {
      let oldest: Pending | null = null;
      for (const p of pending.values()) if (!oldest || p.startedAt < oldest.startedAt) oldest = p;
      const age = oldest ? Date.now() - oldest.startedAt : 0;
      setSlowest(oldest && age >= thresholdMs ? { ...oldest, seconds: Math.floor(age / 1000) } : null);
    };
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [thresholdMs]);
  return slowest;
}

/** Bottom-of-screen notice while something has taken more than 3 seconds. */
export function SlowRequestNotice() {
  const slow = useSlowestRequest(3000);
  if (!slow) return null;
  const others = pending.size - 1;
  const hint =
    slow.target === "server" && slow.seconds >= 8
      ? "The server is probably waking up - it sleeps when nobody has used it for a while. This can take up to a minute."
      : slow.target === "onshape" && slow.seconds >= 10
        ? "Onshape is slow to answer; large assemblies and exports can take a while."
        : "";
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        zIndex: 1000,
        maxWidth: "min(520px, calc(100vw - 32px))",
        padding: "8px 14px",
        borderRadius: 10,
        background: "rgba(24, 24, 27, 0.95)",
        border: "1px solid #3f3f46",
        color: "#e4e4e7",
        fontSize: 12,
        lineHeight: 1.4,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {slow.label}... {slow.seconds} s{others > 0 ? ` (+${others} more)` : ""}
      </div>
      {hint && <div style={{ color: "#a1a1aa", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}
