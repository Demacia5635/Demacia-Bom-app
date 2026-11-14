/**
 * Content script (runs inside cad.onshape.com pages).
 * Only job: show a "BOM" button on assembly tabs that opens the side panel.
 * All Onshape data access happens in the side panel itself.
 *
 * MUST NOT import anything: content scripts load as classic scripts, and a
 * shared import would become an `import` statement the browser rejects.
 */

// Keep in sync with background.ts.
const OPEN_PANEL_MESSAGE = "demacia-bom:openPanel";
const BUTTON_ID = "demacia-bom-open";

(() => {
  const w = window as Window & { __demaciaBomLoaded?: boolean };
  if (w.__demaciaBomLoaded) return;
  w.__demaciaBomLoaded = true;

  const elementTypeCache = new Map<string, string>();

  // /documents/{did}/{w|v|m}/{wvmId}/e/{eid}
  function parseLocation() {
    const m = location.pathname.match(
      /^\/documents\/([0-9a-f]{24})\/([wvm])\/([0-9a-f]{24})\/e\/([0-9a-f]{24})/
    );
    return m ? { did: m[1], wvm: m[2], wvmId: m[3], eid: m[4] } : null;
  }

  async function getElementType(loc: NonNullable<ReturnType<typeof parseLocation>>) {
    const key = `${loc.did}/${loc.wvm}/${loc.wvmId}/${loc.eid}`;
    const cached = elementTypeCache.get(key);
    if (cached) return cached;
    // Same-origin, read-only, uses the user's Onshape session.
    const res = await fetch(
      `/api/v9/documents/d/${loc.did}/${loc.wvm}/${loc.wvmId}/elements?elementId=${loc.eid}`,
      { credentials: "include", headers: { Accept: "application/json;charset=UTF-8; qs=0.09" } }
    );
    if (!res.ok) throw new Error(`Onshape API ${res.status}`);
    const list = await res.json();
    const type: string = (Array.isArray(list) && list[0]?.elementType) || "UNKNOWN";
    elementTypeCache.set(key, type);
    return type;
  }

  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.type = "button";
  btn.hidden = true;
  btn.title = "Open the Demacia BOM side panel";
  // Demacia logo (logo.svg, from public/favicon.svg) drawn in the text color,
  // followed by "BOM".
  const logo = document.createElement("span");
  logo.className = "demacia-bom-logo";
  logo.setAttribute("aria-hidden", "true");
  const logoUrl = `url("${chrome.runtime.getURL("logo.svg")}")`;
  logo.style.setProperty("-webkit-mask-image", logoUrl);
  logo.style.setProperty("mask-image", logoUrl);
  btn.append(logo, document.createTextNode("BOM"));
  btn.addEventListener("click", () => {
    try {
      chrome.runtime.sendMessage({ type: OPEN_PANEL_MESSAGE });
    } catch {
      // Extension was reloaded/updated; this orphaned script can't reach it.
      alert("The Demacia BOM extension was updated - please reload this Onshape tab.");
    }
  });
  document.body.appendChild(btn);

  // Onshape is a single-page app: tab switches change the URL without a page
  // load. Re-check whenever the URL changes.
  let lastHref = "";
  async function refresh() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    const loc = parseLocation();
    if (!loc) {
      btn.hidden = true;
      return;
    }
    try {
      const type = await getElementType(loc);
      if (location.href === lastHref) btn.hidden = type !== "ASSEMBLY";
    } catch (err) {
      console.warn("[Demacia BOM] could not determine element type", err);
      btn.hidden = true;
    }
  }
  refresh();

  // The Navigation API reports every same-document URL change (pushState,
  // replaceState, back/forward) - including ones made by the page's own
  // scripts, which a content script can't hook directly.
  const nav = (window as Window & { navigation?: EventTarget }).navigation;
  if (nav) {
    nav.addEventListener("currententrychange", () => refresh());
  } else {
    // Older browsers without the Navigation API: fall back to polling.
    setInterval(refresh, 1000);
  }
  window.addEventListener("popstate", () => refresh());
  window.addEventListener("hashchange", () => refresh());
})();
