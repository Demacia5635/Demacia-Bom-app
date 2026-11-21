import { useCallback, useEffect, useRef } from "react";

interface Handlers<Result> {
  /** Sends one key's changed fields. */
  save: (key: string, changes: Record<string, unknown>) => Promise<Result>;
  onSaved?: (key: string, result: Result) => void;
  /** `label` is the last one queued for this key (e.g. the part's name, for the message). */
  onFailed?: (key: string, error: unknown, label?: string) => void;
}

interface Pending {
  changes: Record<string, unknown>;
  timer?: ReturnType<typeof setTimeout>;
  label?: string;
}

/**
 * Saves edits shortly after the last change, per key (a part, a work-order
 * row) and only the fields that changed, so people editing different records
 * don't overwrite each other. A failed save keeps its changes for that key's
 * next save (newer edits win). Returns `queue(key, changes, label?)`.
 */
export function useDebouncedFieldSave<Result>(handlers: Handlers<Result>, delayMs = 600) {
  // The latest handlers, for saves whose timer fires after a re-render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const pendingRef = useRef(new Map<string, Pending>());

  return useCallback(
    (key: string, changes: Record<string, unknown>, label?: string) => {
      const pending = pendingRef.current.get(key) ?? { changes: {} };
      Object.assign(pending.changes, changes);
      if (label) pending.label = label;
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = setTimeout(async () => {
        pendingRef.current.delete(key);
        try {
          const result = await handlersRef.current.save(key, pending.changes);
          handlersRef.current.onSaved?.(key, result);
        } catch (err) {
          // Kept for this key's next save (newer edits made meanwhile win).
          const next = pendingRef.current.get(key);
          if (next) next.changes = { ...pending.changes, ...next.changes };
          else pendingRef.current.set(key, { changes: pending.changes, label: pending.label });
          handlersRef.current.onFailed?.(key, err, pending.label);
        }
      }, delayMs);
      pendingRef.current.set(key, pending);
    },
    [delayMs]
  );
}
