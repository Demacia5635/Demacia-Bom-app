/**
 * The side panel's toast messages (shown by <Toasts> in toast.tsx). Stand-in
 * for Onshape's showMessageBubble, which only exists for iframe extensions.
 */

export interface Toast {
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

/** The toasts shown now. */
export const currentToasts = (): Toast[] => toasts;

/** Calls `listener` whenever the toasts change; returns the unsubscribe. */
export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
