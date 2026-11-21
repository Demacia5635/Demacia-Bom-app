/**
 * Names and checks shared by the background scripts (background.ts,
 * background.firefox.ts) and the panel (onshapeTab.ts). content.ts can't
 * import (it runs as a classic script) and keeps its own copy of
 * OPEN_PANEL_MESSAGE: keep the two in sync.
 */

/** Sent by the in-page "BOM" button (content.ts) to open or close the panel. */
export const OPEN_PANEL_MESSAGE = "demacia-bom:openPanel";

/** Chrome: each open panel holds a port named this + its tab ID (reportPanelOpen). */
export const PANEL_PORT_PREFIX = "demacia-bom:panel:";

/**
 * The extension only has host permission for *.onshape.com, so the browser
 * only reveals the URL of Onshape tabs: any other page has no `url`, which is
 * exactly "not Onshape".
 */
export function isOnshapeUrl(url: string | undefined): boolean {
  return !!url && /^https:\/\/([^/]+\.)?onshape\.com\//.test(url);
}
