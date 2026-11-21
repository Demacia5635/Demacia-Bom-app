/**
 * Shows the side panel's toast messages (showToast in toastStore.ts).
 */
import { useEffect, useState } from "react";
import { currentToasts, subscribeToasts, type Toast } from "./toastStore";

export function Toasts() {
  const [items, setItems] = useState<Toast[]>(currentToasts);
  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;
  return (
    <div className="fixed top-2 inset-x-2 z-50 flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto rounded-md bg-blue-600 text-white text-xs px-3 py-2 shadow-lg"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
