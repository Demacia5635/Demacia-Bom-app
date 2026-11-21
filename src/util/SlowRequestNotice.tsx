/**
 * Bottom-of-screen notice while a request has taken more than a few seconds
 * ("Loading parts from the database... 7 s"). Render it once per app; the
 * requests come from installRequestTracking() (slowRequests.ts).
 */
import { useEffect, useState } from "react";
import { pendingRequests, type PendingRequest } from "./slowRequests";

/** The longest-running tracked request, once it's older than `thresholdMs`. */
function useSlowestRequest(thresholdMs: number): (PendingRequest & { seconds: number }) | null {
  const [slowest, setSlowest] = useState<(PendingRequest & { seconds: number }) | null>(null);
  useEffect(() => {
    const tick = () => {
      let oldest: PendingRequest | null = null;
      for (const p of pendingRequests()) if (!oldest || p.startedAt < oldest.startedAt) oldest = p;
      const age = oldest ? Date.now() - oldest.startedAt : 0;
      setSlowest(oldest && age >= thresholdMs ? { ...oldest, seconds: Math.floor(age / 1000) } : null);
    };
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [thresholdMs]);
  return slowest;
}

/** Bottom-of-screen notice while something has taken more than 3 seconds. */
export default function SlowRequestNotice() {
  const slow = useSlowestRequest(3000);
  if (!slow) return null;
  const others = pendingRequests().length - 1;
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
