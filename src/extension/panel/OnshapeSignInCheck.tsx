/**
 * Shows its children once the browser is signed in to Onshape; otherwise a
 * short explanation and a "Try again" button. Every Onshape call the panel
 * makes uses that browser session (/api/users/sessioninfo here is
 * session-authenticated too, so it doesn't count against the API limit).
 */
import { useEffect, useState, type ReactNode } from "react";
import { onshapeJson } from "../onshapeDirect";

interface SessionInfo {
  id?: string;
  name?: string;
  email?: string;
}

export default function OnshapeSignInCheck({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("checking");
    onshapeJson<SessionInfo>("/users/sessioninfo")
      .then((info) => {
        if (cancelled) return;
        if (!info?.id && !info?.name && !info?.email) throw new Error("Onshape didn't return a signed-in user.");
        setState("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state === "ok") return <>{children}</>;

  return (
    <div className="p-4">
      <h1 className="text-base font-bold mb-3">Demacia BOM</h1>
      {state === "error" ? (
        <>
          <p className="text-sm text-red-500 mb-2">You're not signed in to Onshape.</p>
          <p className="text-xs text-zinc-500 mb-3 break-words">{error}</p>
          <p className="text-xs text-zinc-500 mb-3">Sign in to Onshape in this browser, then try again.</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 text-white"
          >
            Try again
          </button>
        </>
      ) : (
        <p className="text-sm text-zinc-500">Checking your Onshape sign-in...</p>
      )}
    </div>
  );
}
