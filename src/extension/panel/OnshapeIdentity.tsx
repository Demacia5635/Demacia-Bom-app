/**
 * Replaces the Demacia sign-in inside the extension: the user is whoever is
 * signed in to Onshape in this browser.
 *
 * AssemblyBomPage reads the user from localStorage "username" and redirects to
 * /signin when it's missing (or on "Sign Out"). In the panel, /signin renders
 * this component, which reads the Onshape session (/api/users/sessioninfo,
 * session-authenticated, so it doesn't count against the API limit), stores
 * the name, and returns to the BOM page.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onshapeJson } from "../onshapeDirect";

interface SessionInfo {
  id?: string;
  name?: string;
  email?: string;
}

export default function OnshapeIdentity() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    onshapeJson<SessionInfo>("/users/sessioninfo")
      .then((info) => {
        if (cancelled) return;
        const name = info?.name || info?.email;
        if (!name) throw new Error("Onshape didn't return a user name.");
        localStorage.setItem("username", name);
        navigate("/", { replace: true });
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, attempt]);

  return (
    <div className="p-4">
      <h1 className="text-base font-bold mb-3">Demacia BOM</h1>
      {error ? (
        <>
          <p className="text-sm text-red-500 mb-2">Couldn't identify your Onshape user.</p>
          <p className="text-xs text-zinc-500 mb-3 break-words">{error}</p>
          <p className="text-xs text-zinc-500 mb-3">Sign in to Onshape in this browser, then try again.</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 text-white"
          >
            Try again
          </button>
        </>
      ) : (
        <p className="text-sm text-zinc-500">Checking your Onshape account…</p>
      )}
    </div>
  );
}
