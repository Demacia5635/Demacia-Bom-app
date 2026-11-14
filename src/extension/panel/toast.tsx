/**
 * Minimal toast notifications for the side panel. Stand-in for Onshape's
 * showMessageBubble, which only exists for iframe extensions.
 */
import { useEffect, useState } from "react";

interface Toast {
  id: number;
  message: string;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const TOAST_MS = 5000;

function emit() {
  for (const l of listeners) l(toasts);
}

export function showToast(message: string): void {
  const id = nextId++;
  toasts = [...toasts, { id, message }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, TOAST_MS);
}

export function Toasts() {
  const [items, setItems] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

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
