import { useState } from "react";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import RecordDialog from "../../components/RecordDialog";
import type { OrphanPart } from "./OrphansPage";
import { deleteOrphans, isSecretRejected, type DeleteOutcome } from "./orphanDelete";
import { readTabSecret as readSecret, writeTabSecret as writeSecret } from "../../util/adminUnlock";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const partName = (p: OrphanPart) => p.name || p.catalogNumber || p.id;

/**
 * Deletes one part (its card's Delete) or several (Bulk delete) that no
 * assembly uses: server POST /db/part/orphans/delete, 200 at a time, which
 * checks each again. Needs the admin secret; shows what happened to each part.
 */
export default function DeleteOrphanDialog({ parts, onClose, onDeleted }: {
  parts: OrphanPart[];
  onClose: () => void;
  /** The ids deleted (each batch as it's done). */
  onDeleted: (ids: string[]) => void;
}) {
  const theme = useThemeClasses();
  const [secret, setSecret] = useState(readSecret);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<DeleteOutcome | null>(null);
  const single = parts.length === 1;
  const files = parts.reduce((sum, p) => sum + (p.filesToTrash ?? 0), 0);
  const busy = progress !== null;
  // Nothing went through yet (e.g. a wrong secret on the first batch): the form stays.
  const finished = outcome !== null && (outcome.deleted.size > 0 || outcome.refused.size > 0);

  const handleDelete = async () => {
    setOutcome(null);
    const typed = secret.trim();
    const result = await deleteOrphans(parts.map((p) => p.id), typed, (done, total) => setProgress({ done, total }));
    setProgress(null);
    if (result.error && isSecretRejected(result.error)) writeSecret(null);
    else if (!result.error || result.deleted.size > 0) writeSecret(typed);
    if (result.deleted.size > 0) onDeleted([...result.deleted.keys()]);
    setOutcome(result);
  };

  const title = single ? `Delete ${partName(parts[0])}?` : `Delete ${parts.length} parts?`;
  return (
    <RecordDialog onClose={busy ? () => undefined : onClose}>
      <div className={`mx-auto max-w-lg border rounded-xl p-5 sm:p-6 space-y-4 ${theme.cardWithText}`}>
        <h2 className="text-lg font-semibold pr-20 break-words">{finished ? (single ? partName(parts[0]) : `${parts.length} parts`) : title}</h2>
        {single && parts[0].catalogNumber && parts[0].name && <p className={`text-xs font-mono -mt-3 ${theme.textMuted}`}>{parts[0].catalogNumber}</p>}

        {finished ? (
          <Results parts={parts} outcome={outcome} />
        ) : (
          <>
            {!single && (
              <ul className={`max-h-48 overflow-y-auto border rounded-lg divide-y divide-zinc-500/20 text-sm ${theme.border}`}>
                {parts.map((p) => (
                  <li key={p.id} className="px-3 py-1.5 flex gap-2 min-w-0">
                    <span className="truncate">{partName(p)}</span>
                    {p.name && p.catalogNumber && <span className={`ml-auto shrink-0 font-mono text-xs ${theme.textMuted}`}>{p.catalogNumber}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm">
              {files > 0
                ? `${single ? "Deletes this part" : `Deletes ${plural(parts.length, "part")}`} and moves ${plural(files, "file")} to the Drive trash. Can't be undone here.`
                : `${single ? "Deletes this part" : `Deletes ${plural(parts.length, "part")}`}. No files go to the Drive trash (none, or other records use them). Can't be undone here.`}
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
                  disabled={busy}
                  className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm font-normal ${theme.input}`}
                />
              </label>
              {outcome?.stopped && <p className="text-sm text-red-500">{outcome.stopped}</p>}
              {progress && progress.total > 1 && (
                <p className={`text-sm ${theme.textLabel}`}>Deleting… {progress.done} of {progress.total}</p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} disabled={busy} className={`px-4 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50 ${theme.border}`}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!secret.trim() || busy}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {busy ? "Deleting…" : single ? "Delete" : `Delete ${plural(parts.length, "part")}`}
                </button>
              </div>
            </form>
          </>
        )}
        {finished && (
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

/** What happened to each part: deleted (files trashed), not deleted (the server's reason), or not tried (stopped). */
function Results({ parts, outcome }: { parts: OrphanPart[]; outcome: DeleteOutcome }) {
  const theme = useThemeClasses();
  const notTried = parts.filter((p) => !outcome.deleted.has(p.id) && !outcome.refused.has(p.id));
  const status = (p: OrphanPart) => {
    const files = outcome.deleted.get(p.id);
    if (files !== undefined) return { ok: true, text: files > 0 ? `Deleted · ${plural(files, "file")} to the Drive trash` : "Deleted" };
    const reason = outcome.refused.get(p.id);
    if (reason !== undefined) return { ok: false, text: `Not deleted: ${reason}` };
    return { ok: false, text: "Not tried (stopped)" };
  };
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">
        <span className="text-green-500">Deleted {outcome.deleted.size}</span>
        {outcome.refused.size > 0 && <span className="text-red-500"> · Not deleted {outcome.refused.size}</span>}
        {notTried.length > 0 && <span className={theme.textMuted}> · Not tried {notTried.length}</span>}
      </p>
      {outcome.stopped && <p className="text-sm text-red-500">Stopped: {outcome.stopped}</p>}
      <ul className={`max-h-64 overflow-y-auto border rounded-lg divide-y divide-zinc-500/20 text-sm ${theme.border}`}>
        {parts.map((p) => {
          const s = status(p);
          return (
            <li key={p.id} className="px-3 py-1.5">
              <div className="flex gap-2 min-w-0">
                <span className="truncate font-medium">{partName(p)}</span>
                {p.name && p.catalogNumber && <span className={`ml-auto shrink-0 font-mono text-xs ${theme.textMuted}`}>{p.catalogNumber}</span>}
              </div>
              <div className={`text-xs ${s.ok ? "text-green-500" : "text-red-500"}`}>{s.text}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
