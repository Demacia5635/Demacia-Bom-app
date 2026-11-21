/**
 * A desktop notification when a long Publish BOM ends while nobody is looking
 * at the panel (it's hidden, or another window has the focus). Needs the
 * extension's "notifications" permission; without it nothing is shown.
 */
const LONG_PUBLISH_MS = 30_000;

export function notifyPublishEnded(startedAt: number, title: string, body: string): void {
  if (Date.now() - startedAt < LONG_PUBLISH_MS) return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification(title, { body: body.length > 220 ? `${body.slice(0, 217)}...` : body });
  } catch {
    // Not available here: the result is still shown in the panel.
  }
}
