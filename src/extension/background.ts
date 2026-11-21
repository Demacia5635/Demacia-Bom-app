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
  tabsWithPanel.add(tabId);
  // ?tab= tells the panel which tab it belongs to (onshapeTab.ts getOwnTab),
  // even if the user switches tabs while it loads.
  chrome.sidePanel.setOptions({ tabId, path: `${PANEL_PATH}?tab=${tabId}`, enabled: true }).catch(console.error);
  chrome.sidePanel.open({ tabId }).catch(console.error);
}

// Each open panel holds a port named PANEL_PORT_PREFIX + its tab ID
// (reportPanelOpen in onshapeTab.ts). Kept in memory so the click handlers
// can check it synchronously (sidePanel.open must be called before any await).
// The panel pings the port, which keeps this worker alive while a panel is
// open; if the worker is restarted anyway, the panels reconnect.
const PANEL_PORT_PREFIX = "demacia-bom:panel:";
const tabsWithOpenPanel = new Set<number>();
/**
 * Tabs this worker enabled a panel for (open or since closed by the user).
 * Forgotten if the worker restarts; open panels are still known by their port.
 */
const tabsWithPanel = new Set<number>();

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith(PANEL_PORT_PREFIX)) return;
  const tabId = Number(port.name.slice(PANEL_PORT_PREFIX.length));
  if (!Number.isInteger(tabId)) return;
  tabsWithOpenPanel.add(tabId);
  port.onMessage.addListener(() => {}); // keep-alive pings: receiving them is enough
  port.onDisconnect.addListener(() => tabsWithOpenPanel.delete(tabId));
});

/** Closes the tab's panel (its state is discarded, as when the user closes it). */
function closePanelForTab(tabId: number): void {
  tabsWithOpenPanel.delete(tabId);
  // sidePanel.close exists from Chrome 141; disabling the tab's panel closes it too.
  const sidePanel = chrome.sidePanel as { close?: (o: { tabId: number }) => Promise<void> };
  if (sidePanel.close) {
    sidePanel.close({ tabId }).catch(() => chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(console.error));
  } else {
    chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(console.error);
  }
}

/** Icon / "BOM" button click: opens the tab's panel, or closes it if it's already open. */
function togglePanelForTab(tabId: number): void {
  if (tabsWithOpenPanel.has(tabId)) closePanelForTab(tabId);
  else openPanelForTab(tabId);
}

// In-page "BOM" button.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === OPEN_PANEL_MESSAGE && sender.tab?.id !== undefined) {
    togglePanelForTab(sender.tab.id);
  }
});

// Toolbar icon: only meaningful on an Onshape tab.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined && isOnshapeUrl(tab.url)) togglePanelForTab(tab.id);
});

// The tab left Onshape (navigated to another site): close its panel. Only
// tabs that have one: other tabs' page loads don't need a sidePanel call.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" && changeInfo.url === undefined) return;
  if (!tabsWithPanel.has(tabId) && !tabsWithOpenPanel.has(tabId)) return;
  if (!isOnshapeUrl(tab.url)) {
    tabsWithPanel.delete(tabId);
    tabsWithOpenPanel.delete(tabId);
    chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  tabsWithPanel.delete(tabId);
  tabsWithOpenPanel.delete(tabId);
});
