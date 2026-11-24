import { useState } from "react";
import { useThemeClasses } from "../../util/misc/useThemeClasses";
import RecordDialog from "../RecordDialog";
import { readTabSecret, writeTabSecret } from "../../util/adminUnlock";
import { isSecretRejected, type DeleteOutcome } from "./bulkDelete";

export interface DeleteItem {
  id: string;
  name: string;
  /** Shown beside the name (a catalog #, a size). */
  detail?: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Deletes one item (its own Delete) or several (Bulk delete) with the admin
 * secret (kept for the tab), 200 at a time, then lists what happened to each:
 * deleted, not deleted (the server's reason) or not tried (stopped). Used by
 * /orphans (parts) and /files (Drive files).
 */
export default function DeleteDialog({ items, noun, warning, deletedText, run, onClose, onDeleted }: {
  items: DeleteItem[];
  /** e.g. ["part", "parts"]. */
  noun: [one: string, many: string];
  /** What deleting does, e.g. "Deletes 3 parts and moves 4 files to the Drive trash." ("Can't be undone here." is added). */
  warning: string;
  /** A deleted item's result line ("Deleted · 3 files to the Drive trash"). */
  deletedText: (count: number) => string;
  run: (ids: string[], secret: string, onProgress: (done: number, total: number) => void) => Promise<DeleteOutcome>;
  onClose: () => void;
  /** The ids deleted. */
  onDeleted: (ids: string[]) => void;
}) {
  const theme = useThemeClasses();
  const [secret, setSecret] = useState(readTabSecret);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<DeleteOutcome | null>(null);
  const single = items.length === 1;
  const busy = progress !== null;
  // Nothing went through yet (e.g. a wrong secret on the first batch): the form stays.
  const finished = outcome !== null && (outcome.deleted.size > 0 || outcome.refused.size > 0);
  const countText = plural(items.length, noun[0], noun[1]);

  const handleDelete = async () => {
    setOutcome(null);
    const typed = secret.trim();
    const result = await run(items.map((i) => i.id), typed, (done, total) => setProgress({ done, total }));
    setProgress(null);
    if (result.error && isSecretRejected(result.error)) writeTabSecret(null);
    else if (!result.error || result.deleted.size > 0) writeTabSecret(typed);
    if (result.deleted.size > 0) onDeleted([...result.deleted.keys()]);
    setOutcome(result);
  };

  return (
    <RecordDialog onClose={busy ? () => undefined : onClose}>
      <div className={`mx-auto max-w-lg border rounded-xl p-5 sm:p-6 space-y-4 ${theme.cardWithText}`}>
        <h2 className="text-lg font-semibold pr-20 break-words">
          {finished ? (single ? items[0].name : countText) : single ? `Delete ${items[0].name}?` : `Delete ${countText}?`}
        </h2>
        {single && items[0].detail && <p className={`text-xs font-mono -mt-3 ${theme.textMuted}`}>{items[0].detail}</p>}

        {finished ? (
          <Results items={items} outcome={outcome} deletedText={deletedText} />
        ) : (
          <>
            {!single && <ItemList items={items} />}
            <p className="text-sm">{warning} Can&apos;t be undone here.</p>
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
              {progress && progress.total > 1 && <p className={`text-sm ${theme.textLabel}`}>Deleting… {progress.done} of {progress.total}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} disabled={busy} className={`px-4 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50 ${theme.border}`}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!secret.trim() || busy}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {busy ? "Deleting…" : single ? "Delete" : `Delete ${countText}`}
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

function ItemList({ items }: { items: DeleteItem[] }) {
  const theme = useThemeClasses();
  return (
    <ul className={`max-h-48 overflow-y-auto border rounded-lg divide-y divide-zinc-500/20 text-sm ${theme.border}`}>
      {items.map((i) => (
        <li key={i.id} className="px-3 py-1.5 flex gap-2 min-w-0">
          <span className="truncate">{i.name}</span>
          {i.detail && <span className={`ml-auto shrink-0 font-mono text-xs ${theme.textMuted}`}>{i.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/** What happened to each item: deleted, not deleted (the server's reason), or not tried (stopped). */
function Results({ items, outcome, deletedText }: { items: DeleteItem[]; outcome: DeleteOutcome; deletedText: (count: number) => string }) {
  const theme = useThemeClasses();
  const notTried = items.filter((i) => !outcome.deleted.has(i.id) && !outcome.refused.has(i.id));
  const status = (i: DeleteItem) => {
    const count = outcome.deleted.get(i.id);
    if (count !== undefined) return { ok: true, text: deletedText(count) };
    const reason = outcome.refused.get(i.id);
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
        {items.map((i) => {
          const s = status(i);
          return (
            <li key={i.id} className="px-3 py-1.5">
              <div className="flex gap-2 min-w-0">
                <span className="truncate font-medium">{i.name}</span>
                {i.detail && <span className={`ml-auto shrink-0 font-mono text-xs ${theme.textMuted}`}>{i.detail}</span>}
              </div>
              <div className={`text-xs ${s.ok ? "text-green-500" : "text-red-500"}`}>{s.text}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
