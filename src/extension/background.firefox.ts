/**
 * Firefox background script: the Firefox counterpart of background.ts.
 *
 * Firefox has no chrome.sidePanel; it has one sidebar per window
 * (sidebarAction). To keep the panel tied to one Onshape tab like in Chrome,
 * each tab it's opened for gets its own panel document, panel.html?tab=<id>
 * (onshapeTab.ts reads that ID). Firefox shows a tab's panel while that tab is
 * active and the manifest's default panel on other tabs.
 *
 * Differences from Chrome:
 *  - Firefox reloads the panel document when you switch tabs and back, so
 *    unpublished edits in the panel don't survive a tab switch.
 *  - sidebarAction.open() only works from a "user input handler". The toolbar
 *    icon qualifies; a message from the in-page button may not, in which case
 *    the panel is still assigned to the tab and opens from the toolbar icon or
 *    the sidebar menu.
 */

// Keep in sync with content.ts (content scripts can't import shared modules).
const OPEN_PANEL_MESSAGE = "demacia-bom:openPanel";
const PANEL_PATH = "panel.html";

/** The part of Firefox's sidebarAction API used here (not in @types/chrome). */
interface SidebarAction {
  setPanel(details: { tabId?: number; panel: string | null }): Promise<void>;
  open(): Promise<void>;
  toggle(): Promise<void>;
}
const sidebarAction = (globalThis as unknown as { browser: { sidebarAction: SidebarAction } }).browser
  .sidebarAction;

function isOnshapeUrl(url: string | undefined): boolean {
  return !!url && /^https:\/\/([^/]+\.)?onshape\.com\//.test(url);
}

/**
 * Assigns this tab its own panel and opens the sidebar, or closes it if it's
 * already open (a second click on the icon / "BOM" button). Both calls are
 * made synchronously (no awaits before toggle()), as Firefox requires.
 */
function togglePanelForTab(tabId: number): Promise<boolean> {
  sidebarAction.setPanel({ tabId, panel: `${PANEL_PATH}?tab=${tabId}` }).catch(console.error);
  return sidebarAction.toggle().then(
    () => true,
    (err) => {
      console.warn("[Demacia BOM] could not open/close the sidebar from here; use the toolbar icon", err);
      return false;
    }
  );
}

// In-page "BOM" button. A message isn't a user action to Firefox, so toggle()
// is usually refused: reply { opened: false } and content.ts tells the user
// to click the toolbar icon (the panel is already assigned to this tab).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === OPEN_PANEL_MESSAGE && sender.tab?.id !== undefined) {
    void togglePanelForTab(sender.tab.id).then((opened) => sendResponse({ opened }));
    return true; // replies asynchronously
  }
});

// Toolbar icon: only meaningful on an Onshape tab.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined && isOnshapeUrl(tab.url)) togglePanelForTab(tab.id);
});

// The tab left Onshape: drop its own panel (back to the default one).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" && changeInfo.url === undefined) return;
  if (!isOnshapeUrl(tab.url)) {
    sidebarAction.setPanel({ tabId, panel: null }).catch(() => {});
  }
});
