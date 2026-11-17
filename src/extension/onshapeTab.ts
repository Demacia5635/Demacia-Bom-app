/**
 * Tracks which Onshape document/element the user is looking at, by reading the
 * active tab's URL from the side panel. Replaces the iframe query-string
 * context that the old Onshape Application Extension received.
 */
import { useEffect, useState } from "react";

export type WvmType = "w" | "v" | "m";

export interface OnshapeLocation {
  /** e.g. https://cad.onshape.com */
  server: string;
  documentId: string;
  wvmType: WvmType;
  wvmId: string;
  elementId: string;
  configuration: string | null;
}

export interface ActiveTabState {
  loading: boolean;
  tabId: number | null;
  /** null when the active tab isn't an Onshape document element. */
  location: OnshapeLocation | null;
}

const PATH_RE = /^\/documents\/([0-9a-f]{24})\/([wvm])\/([0-9a-f]{24})\/e\/([0-9a-f]{24})/;

/** https://cad.onshape.com/documents/{did}/{w|v|m}/{wvmId}/e/{eid}?configuration=... */
export function parseOnshapeUrl(rawUrl: string | undefined | null): OnshapeLocation | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".onshape.com")) return null;
  const m = url.pathname.match(PATH_RE);
  if (!m) return null;
  return {
    server: url.origin,
    documentId: m[1],
    wvmType: m[2] as WvmType,
    wvmId: m[3],
    elementId: m[4],
    configuration: url.searchParams.get("configuration"),
  };
}

function sameLocation(a: OnshapeLocation | null, b: OnshapeLocation | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.server === b.server &&
    a.documentId === b.documentId &&
    a.wvmType === b.wvmType &&
    a.wvmId === b.wvmId &&
    a.elementId === b.elementId &&
    a.configuration === b.configuration
  );
}

/**
 * The tab this panel document was opened for. Firefox gives each tab its own
 * panel document, panel.html?tab=<id> (background.firefox.ts). Otherwise
 * (Chrome, or Firefox's default panel) it's the tab that is active while the
 * panel loads.
 */
export function getOwnTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabParam = Number(new URLSearchParams(window.location.search).get("tab"));
  return Number.isInteger(tabParam) && tabParam > 0
    ? chrome.tabs.get(tabParam).catch(() => undefined)
    : chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab);
}

/**
 * Chrome only: tells the background worker that this panel is open for its
 * tab, so a second click on the toolbar icon or the in-page "BOM" button
 * closes it (background.ts). The open port is the signal; when the worker is
 * restarted the port drops, so reconnect to re-register.
 */
export function reportPanelOpen(): void {
  if (!("sidePanel" in chrome)) return; // Firefox toggles its sidebar itself.
  void getOwnTab().then((tab) => {
    if (tab?.id === undefined) return;
    const name = `${PANEL_PORT_PREFIX}${tab.id}`;
    const connect = () => {
      try {
        chrome.runtime.connect({ name }).onDisconnect.addListener(() => setTimeout(connect, 200));
      } catch {
        // Extension reloaded: this panel is orphaned; nothing to report to.
      }
    };
    connect();
  });
}

// Keep in sync with background.ts.
const PANEL_PORT_PREFIX = "demacia-bom:panel:";

/**
 * The Onshape tab this side panel belongs to. The panel is opened per tab
 * (see background.ts), so it binds to the tab that was active when it opened
 * and then follows only that tab's own navigation (Onshape changes the URL
 * when you switch element tabs). Switching to other tabs doesn't change it:
 * Chrome hides this panel there and shows it again, as it was, on return.
 * `location` keeps the same object identity while the Onshape location is
 * unchanged, so it's safe to use as an effect dependency.
 *
 * Tab URLs are visible only for hosts in host_permissions, so non-Onshape
 * pages simply read as `location: null` (no "tabs" permission needed).
 */
export function useOwnOnshapeTab(): ActiveTabState {
  const [state, setState] = useState<ActiveTabState>({ loading: true, tabId: null, location: null });

  useEffect(() => {
    let cancelled = false;
    let ownTabId: number | null = null;

    const apply = (tab: chrome.tabs.Tab | undefined) => {
      const next = parseOnshapeUrl(tab?.url);
      setState((prev) =>
        !prev.loading && prev.tabId === (tab?.id ?? null) && sameLocation(prev.location, next)
          ? prev
          : { loading: false, tabId: tab?.id ?? null, location: next }
      );
    };

    const onUpdated = (tabId: number, info: { url?: string; status?: string }, tab: chrome.tabs.Tab) => {
      if (tabId === ownTabId && (info.url || info.status === "complete")) apply(tab);
    };

    void getOwnTab().then((tab) => {
      if (cancelled) return;
      ownTabId = tab?.id ?? null;
      apply(tab);
    });
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      cancelled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return state;
}
