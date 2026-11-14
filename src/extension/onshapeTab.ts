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
 * Active tab of the window this side panel belongs to. Updates on tab switch,
 * in-tab navigation (Onshape changes the URL when you switch element tabs),
 * and window focus. `location` keeps the same object identity while the
 * Onshape location is unchanged, so it's safe to use as an effect dependency.
 *
 * Tab URLs are visible only for hosts in host_permissions, so non-Onshape
 * tabs simply read as `location: null` (no "tabs" permission needed).
 */
export function useActiveOnshapeTab(): ActiveTabState {
  const [state, setState] = useState<ActiveTabState>({ loading: true, tabId: null, location: null });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (cancelled) return;
      const next = parseOnshapeUrl(tab?.url);
      setState((prev) =>
        !prev.loading && prev.tabId === (tab?.id ?? null) && sameLocation(prev.location, next)
          ? prev
          : { loading: false, tabId: tab?.id ?? null, location: next }
      );
    };

    const onActivated = () => void refresh();
    const onUpdated = (_tabId: number, info: { url?: string; status?: string }, tab: chrome.tabs.Tab) => {
      if (tab.active && (info.url || info.status === "complete")) void refresh();
    };
    const onFocusChanged = () => void refresh();

    void refresh();
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows.onFocusChanged.addListener(onFocusChanged);
    return () => {
      cancelled = true;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows.onFocusChanged.removeListener(onFocusChanged);
    };
  }, []);

  return state;
}
