/**
 * Whether our server (and its database) answers: checked when the panel opens
 * and again before Publish BOM. "slow" while an answer takes more than a few
 * seconds (the free Render server waking up).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFromApi } from "../util/ApiService";

export type ServerState = "checking" | "slow" | "ok" | "down";

export interface ServerStatus {
  state: ServerState;
  /** Why it's down (the error), for the tooltip. */
  detail: string;
  checkedAt: number | null;
}

const SLOW_AFTER_MS = 3000;

export function useServerStatus(): { status: ServerStatus; check: () => void } {
  const [status, setStatus] = useState<ServerStatus>({ state: "checking", detail: "", checkedAt: null });
  const seq = useRef(0);

  /** Asks the server; the state changes only when it answers or turns slow. */
  const run = useCallback(() => {
    const id = ++seq.current;
    const slow = setTimeout(() => {
      if (seq.current === id) setStatus((s) => ({ ...s, state: "slow" }));
    }, SLOW_AFTER_MS);
    fetchFromApi<{ connected?: boolean }>("/db")
      .then(
        (r) =>
          r?.connected === false
            ? { state: "down" as const, detail: "The server is up, but its database isn't connected." }
            : { state: "ok" as const, detail: "" },
        (err: { message?: string; statusCode?: number }) => ({
          state: "down" as const,
          detail:
            err?.statusCode === 503
              ? "The server is up, but its database isn't connected."
              : err?.message || "The server didn't answer.",
        })
      )
      .then((next) => {
        clearTimeout(slow);
        if (seq.current === id) setStatus({ ...next, checkedAt: Date.now() });
      });
  }, []);

  /** Checks again (e.g. before Publish BOM), showing "checking" meanwhile. */
  const check = useCallback(() => {
    setStatus((s) => ({ ...s, state: "checking" }));
    run();
  }, [run]);

  useEffect(() => {
    const requests = seq; // the counter object itself (not a DOM ref)
    run(); // starts as "checking"
    return () => {
      requests.current++; // a late answer after closing is ignored
    };
  }, [run]);

  return { status, check };
}
