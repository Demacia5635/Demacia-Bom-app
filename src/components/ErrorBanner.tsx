import type { ReactNode } from "react";
import type { ApiError } from "../util/ApiService";

/**
 * The red error box. `className` sets its size and spacing (padding, corners,
 * margins, text size), which differ between pages; `title` is a bold first line;
 * `onDismiss` adds a "Dismiss" button on the right.
 */
export default function ErrorBanner({ title, className = "p-4 rounded-lg", onDismiss, children }: {
  title?: string;
  className?: string;
  onDismiss?: () => void;
  children?: ReactNode;
}) {
  const box = `bg-red-900/50 border border-red-500 text-red-200 ${className}`;
  if (onDismiss) {
    return (
      <div className={`flex items-start justify-between gap-3 ${box}`}>
        <span>{children}</span>
        <button type="button" onClick={onDismiss} className="shrink-0 text-xs font-semibold hover:underline">
          Dismiss
        </button>
      </div>
    );
  }
  return (
    <div className={box}>
      {title && <p className="font-semibold">{title}</p>}
      {children}
    </div>
  );
}

/** A failed request's message, with its HTTP status when there is one. */
export function ApiErrorText({ error }: { error: ApiError }) {
  return (
    <>
      <p>{error.message}</p>
      {error.statusCode && <p className="text-sm">HTTP Status Code: {error.statusCode}</p>}
    </>
  );
}
