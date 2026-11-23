import { useState } from "react";
import { ApiRequestError, fetchFromApi } from "../../util/ApiService";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import RecordDialog from "../../components/RecordDialog";
import type { OrphanPart } from "./OrphansPage";

/** The admin secret, kept for this tab only (sessionStorage) once it worked. */
const SECRET_KEY = "bom-admin-secret";

function readSecret(): string {
  try {
    return sessionStorage.getItem(SECRET_KEY) ?? "";
  } catch {
    return "";
  }
}
function writeSecret(secret: string | null): void {
  try {
    if (secret) sessionStorage.setItem(SECRET_KEY, secret);
    else sessionStorage.removeItem(SECRET_KEY);
  } catch {
    // Storage blocked: the secret is typed again next time.
  }
}

interface DeleteReply {
  deleted: { id: string; name?: string; catalogNumber?: string; filesTrashed: string[] }[];
  refused: { id: string; reason: string }[];
}

type Result = { kind: "deleted"; files: number } | { kind: "refused"; reason: string } | { kind: "error"; message: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Deletes one part no assembly uses (server: POST /db/part/orphans/delete,
 * which checks again that nothing uses it). Needs the admin secret.
 */
export default function DeleteOrphanDialog({ part, onClose, onDeleted }: {
  part: OrphanPart;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const theme = useThemeClasses();
  const [secret, setSecret] = useState(readSecret);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const name = part.name || part.catalogNumber || part.id;
  const files = part.filesToTrash ?? 0;

  const handleDelete = async () => {
    setBusy(true);
    setResult(null);
    try {
      const reply = await fetchFromApi<DeleteReply>("/db/part/orphans/delete", {
        method: "POST",
        headers: { "x-admin-secret": secret.trim() },
        body: JSON.stringify({ ids: [part.id] }),
      });
      writeSecret(secret.trim());
      const deleted = reply?.deleted?.find((d) => d.id === part.id);
      if (deleted) {
        setResult({ kind: "deleted", files: deleted.filesTrashed?.length ?? 0 });
        onDeleted(part.id);
      } else {
        const refused = reply?.refused?.find((r) => r.id === part.id);
        setResult({ kind: "refused", reason: refused?.reason || "the server didn't delete it" });
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.statusCode === 404) {
        writeSecret(null);
        setResult({ kind: "error", message: "Wrong admin secret." });
      } else {
        setResult({ kind: "error", message: `Couldn't delete it: ${(err as Error)?.message || err}` });
      }
    } finally {
      setBusy(false);
    }
  };

  const done = result?.kind === "deleted";
  return (
    <RecordDialog onClose={onClose}>
      <div className={`mx-auto max-w-md border rounded-xl p-5 sm:p-6 space-y-4 ${theme.cardWithText}`}>
        <h2 className="text-lg font-semibold pr-20 break-words">Delete {name}?</h2>
        {part.catalogNumber && part.name && <p className={`text-xs font-mono -mt-3 ${theme.textMuted}`}>{part.catalogNumber}</p>}

        {done ? (
          <p className="text-sm text-green-500">
            Deleted {name}.{result.files > 0 ? ` ${plural(result.files, "file")} moved to the Drive trash.` : ""}
          </p>
        ) : (
          <>
            <p className="text-sm">
              {files > 0
                ? `Deletes this part and moves ${plural(files, "file")} to the Drive trash. Can't be undone here.`
                : "Deletes this part. None of its files go to the Drive trash (it has none, or other records use them). Can't be undone here."}
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (secret.trim() && !busy) void handleDelete();
              }}
            >
              <label className={`block text-xs font-semibold ${theme.textLabel}`}>
                Admin secret
                <input
                  type="password"
                  autoComplete="off"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  autoFocus={!secret}
                  className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal ${theme.input}`}
                />
              </label>
              {result && (
                <p className="text-sm text-red-500">
                  {result.kind === "refused" ? `Not deleted: ${name} ${result.reason}.` : result.message}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className={`px-4 py-2 rounded-lg border text-xs font-semibold ${theme.border}`}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!secret.trim() || busy}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </form>
          </>
        )}
        {done && (
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold">
              Close
            </button>
          </div>
        )}
      </div>
    </RecordDialog>
  );
}
