/**
 * Background service worker: manages the side panel, one per Onshape tab.
 *
 * The panel is tab-specific: it's opened for the Onshape tab you click the
 * in-page "BOM" button (content.ts) or the toolbar icon on. Chrome then shows
 * it only while that tab is active: switching to any other tab hides it, and
 * switching back shows it again exactly as it was (same tree, unpublished
 * edits, a publish still running). Each Onshape tab can have its own panel.
 * If the tab itself navigates away from Onshape, its panel is closed.
 */

// Keep in sync with content.ts (content scripts can't import shared modules).
const OPEN_PANEL_MESSAGE = "demacia-bom:openPanel";
const PANEL_PATH = "panel.html";

/**
 * The extension only has host permission for *.onshape.com, so Chrome only
 * reveals the URL of Onshape tabs: any other page (another site, a new tab,
 * chrome:// pages) has no `url` here, which is exactly "not Onshape".
 */
function isOnshapeUrl(url: string | undefined): boolean {
  return !!url && /^https:\/\/([^/]+\.)?onshape\.com\//.test(url);
}

// No window-wide panel: only tabs it's opened for get one. (The manifest's
// default_path would otherwise show the same panel on every tab.) Runs each
// time the service worker starts; it's idempotent.
chrome.sidePanel.setOptions({ enabled: false }).catch(console.error);

// The toolbar icon is handled below (per tab) instead of opening the window-wide panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);

/**
 * Opens the panel for one tab. Must be called synchronously from the user's
 * click (no awaits before sidePanel.open), or Chrome refuses to open it.
 */
function openPanelForTab(tabId: number): void {
  chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: true }).catch(console.error);
  chrome.sidePanel.open({ tabId }).catch(console.error);
}

// In-page "BOM" button.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === OPEN_PANEL_MESSAGE && sender.tab?.id !== undefined) {
    openPanelForTab(sender.tab.id);
  }
});

// Toolbar icon: only meaningful on an Onshape tab.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined && isOnshapeUrl(tab.url)) openPanelForTab(tab.id);
});

// The tab left Onshape (navigated to another site): close its panel.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" && changeInfo.url === undefined) return;
  if (!isOnshapeUrl(tab.url)) {
    chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
  }
});
