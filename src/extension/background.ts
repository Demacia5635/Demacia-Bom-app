/**
 * Background service worker: only opens the side panel.
 * - Toolbar icon click -> opens the panel (setPanelBehavior).
 * - In-page "BOM" button (content.ts) -> sends OPEN_PANEL -> opens the panel.
 */

// Keep in sync with content.ts (content scripts can't import shared modules).
const OPEN_PANEL_MESSAGE = "demacia-bom:openPanel";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === OPEN_PANEL_MESSAGE && sender.tab) {
    // sidePanel.open() must run synchronously inside the user-gesture
    // chain, so no awaits before it.
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
  }
});
