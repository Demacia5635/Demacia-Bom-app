import { useSyncExternalStore } from "react";
import { currentToasts, dismissToast, subscribeToasts } from "../util/toast";

const KIND_CLASS = {
  error: "bg-red-700 text-white",
  success: "bg-emerald-700 text-white",
  info: "bg-zinc-800 text-zinc-100",
} as const;

/** The toasts (util/toast.ts), stacked at the bottom right; a click closes one. */
export default function Toasts() {
  const toasts = useSyncExternalStore(subscribeToasts, currentToasts);
  if (toasts.length === 0) return null;
  return (
    <div className="print:hidden fixed bottom-4 right-4 left-4 sm:left-auto z-[1000000] flex flex-col items-stretch sm:items-end gap-2 pointer-events-none">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          role={t.kind === "error" ? "alert" : "status"}
          onClick={() => dismissToast(t.id)}
          title="Close"
          className={`pointer-events-auto max-w-sm text-left rounded-lg px-4 py-2.5 text-sm shadow-lg whitespace-pre-line ${KIND_CLASS[t.kind]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
