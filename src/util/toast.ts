/**
 * The website's toast messages: short notes at the bottom right that don't
 * block the page (instead of the browser's alert()). Shown by <Toasts> in
 * MainLayout. The extension panel has its own (src/extension/panel/toastStore.ts).
 */

export type ToastKind = "error" | "info" | "success";

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

type Listener = () => void;

const TOAST_MS = 5000;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

/** Removes a toast (a click on it, or its time ran out). */
export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Shows a toast for about 5 seconds. */
export function showToast(message: string, kind: ToastKind = "info"): void {
  const id = nextId++;
  toasts = [...toasts, { id, message, kind }];
  emit();
  setTimeout(() => dismissToast(id), TOAST_MS);
}

/** The toasts shown now (a new array whenever they change). */
export const currentToasts = (): Toast[] => toasts;

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
