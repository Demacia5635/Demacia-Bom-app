import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useThemeClasses } from "../util/misc/useThemeClasses";
import { adminSecretError, enterTabSecret, useAdminUnlocked, useHasTabSecret } from "../util/adminUnlock";

/**
 * An admin page (the sidebar's ADMIN section): a browser that hasn't unlocked
 * them (#/admin) sees where to do so instead. `needsSecret`: the page's data
 * is admin-only (adminFetch), so a tab without the secret asks for it first.
 */
export default function AdminGate({ children, needsSecret = false }: { children: ReactNode; needsSecret?: boolean }) {
  const unlocked = useAdminUnlocked();
  const hasSecret = useHasTabSecret();
  if (!unlocked) {
    return (
      <GateCard>
        <p className="text-sm">This is an admin page.</p>
        <Link to="/admin" className="inline-block text-sm font-semibold text-blue-500 hover:underline">
          Unlock it at #/admin ›
        </Link>
      </GateCard>
    );
  }
  if (needsSecret && !hasSecret) return <SecretForm />;
  return <>{children}</>;
}

function GateCard({ children }: { children: ReactNode }) {
  const theme = useThemeClasses();
  return (
    <div className={`min-h-screen p-4 sm:p-6 ${theme.page}`}>
      <div className={`max-w-md mx-auto mt-8 border rounded-xl p-5 sm:p-6 space-y-3 ${theme.cardWithText}`}>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-500" aria-hidden="true" />
          Admin page
        </h1>
        {children}
      </div>
    </div>
  );
}

/** This tab has no admin secret yet: checked by the server, then kept for the tab. */
function SecretForm() {
  const theme = useThemeClasses();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <GateCard>
      <p className={`text-sm ${theme.textLabel}`}>Enter the admin secret to see this page (kept for this tab only).</p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!secret.trim() || busy) return;
          setBusy(true);
          setError(null);
          try {
            await enterTabSecret(secret.trim());
          } catch (err) {
            setError(adminSecretError(err));
            setBusy(false);
          }
        }}
      >
        <input
          type="password"
          autoComplete="off"
          autoFocus
          aria-label="Admin secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          disabled={busy}
          className={`w-full border rounded-lg px-3 py-2 text-sm ${theme.input}`}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={!secret.trim() || busy}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </GateCard>
  );
}
