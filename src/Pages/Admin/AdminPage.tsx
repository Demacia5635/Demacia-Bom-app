/**
 * Unlocks (or locks) the admin pages in this browser's sidebar: the admin
 * secret is checked by the server once; only "unlocked" is remembered.
 *
 * Route /admin - deliberately not linked anywhere until unlocked.
 */
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ApiRequestError } from "../../util/ApiService";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { lockAdmin, unlockAdmin, useAdminUnlocked } from "../../util/adminUnlock";

function unlockError(err: unknown): string {
  if (err instanceof ApiRequestError && err.statusCode === 404) return "Wrong admin secret.";
  if (err instanceof ApiRequestError && err.statusCode === 429) return err.message || "Too many wrong admin secrets. Try again in 15 minutes.";
  return `Couldn't check it: ${(err as Error)?.message || err}`;
}

export default function AdminPage() {
  const theme = useThemeClasses();
  useDocumentTitle("Admin");
  const unlocked = useAdminUnlocked();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockAdmin(secret.trim());
      setSecret("");
    } catch (err) {
      setError(unlockError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-200 ${theme.page}`}>
      <div className={`max-w-md mx-auto border rounded-xl p-5 sm:p-6 space-y-4 ${theme.cardWithText}`}>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-500" aria-hidden="true" />
          Admin pages
        </h1>
        <p className={`text-sm ${unlocked ? "text-green-500" : theme.textLabel}`}>
          {unlocked
            ? "Unlocked: this browser shows the admin pages at the bottom of the sidebar."
            : "Locked: enter the admin secret to show the admin pages at the bottom of this browser's sidebar."}
        </p>

        {unlocked ? (
          <>
            <p className={`text-xs ${theme.textMuted}`}>
              The secret itself isn't kept: deleting parts still asks for it, once per tab.
            </p>
            <button
              type="button"
              onClick={lockAdmin}
              className={`px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-zinc-500/10 ${theme.border}`}
            >
              Lock (hide the admin pages)
            </button>
          </>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (secret.trim() && !busy) void handleUnlock();
            }}
          >
            <label className={`block text-xs font-semibold ${theme.textLabel}`}>
              Admin secret
              <input
                type="password"
                autoComplete="off"
                autoFocus
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                disabled={busy}
                className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal ${theme.input}`}
              />
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={!secret.trim() || busy}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold"
            >
              {busy ? "Checking…" : "Unlock"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
