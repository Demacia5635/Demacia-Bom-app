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

  // A button in Onshape's right-hand sidebar (BOM Table, Configuration panel...),
  // in a group of its own like an Onshape extension. It uses Onshape's own
  // button classes so it looks like the others.
  const btn = document.createElement("div");
  btn.id = BUTTON_ID;
  btn.className = "btn btn-secondary split-toggle-button split-toggle-button-top-gap";
  btn.setAttribute("role", "button");
  btn.tabIndex = 0;
  btn.hidden = true;
  btn.title = "Demacia BOM";
  btn.setAttribute("aria-label", "Open the Demacia BOM side panel");
  // Demacia logo (logo.svg, from public/favicon.svg) drawn in the icon color.
  const logo = document.createElement("span");
  logo.className = "demacia-bom-logo";
  logo.setAttribute("aria-hidden", "true");
  const logoUrl = `url("${chrome.runtime.getURL("logo.svg")}")`;
  logo.style.setProperty("-webkit-mask-image", logoUrl);
  logo.style.setProperty("mask-image", logoUrl);
  btn.append(logo);

  const openPanel = () => {
    try {
      chrome.runtime.sendMessage({ type: OPEN_PANEL_MESSAGE });
    } catch {
      // Extension was reloaded/updated; this orphaned script can't reach it.
      alert("The Demacia BOM extension was updated - please reload this Onshape tab.");
    }
  };
  btn.addEventListener("click", openPanel);
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPanel();
    }
  });

  /** The sidebar of the tab being shown (each Onshape tab has its own). */
  function findSidebar(): HTMLElement | null {
    const all = Array.from(document.querySelectorAll<HTMLElement>(".right-split-toggle-container"));
    return all.find((el) => el.getClientRects().length > 0) ?? null;
  }

  /**
   * Keeps the button at the bottom of the visible sidebar. Onshape redraws the
   * sidebar when switching tabs, so this runs again whenever the page changes.
   * Without a sidebar (e.g. while it loads) the button floats bottom-right.
   */
  function place() {
    if (btn.hidden) return; // placed again when it's shown (setVisible)
    const sidebar = findSidebar();
    if (sidebar) {
      btn.classList.remove("demacia-bom-floating");
      if (btn.parentElement !== sidebar || sidebar.lastElementChild !== btn) sidebar.appendChild(btn);
    } else {
      btn.classList.add("demacia-bom-floating");
      if (btn.parentElement !== document.body) document.body.appendChild(btn);
    }
  }
  place();

  /** Shows/hides the button; a newly shown button is placed at once. */
  function setVisible(visible: boolean) {
    btn.hidden = !visible;
    if (visible) place();
  }

  // Onshape's DOM changes constantly, and place() searches the page and reads
  // layout. So: nothing while the button is hidden (any non-assembly tab), and
  // at most one place() per PLACE_COOLDOWN_MS - the first change is handled on
  // the next frame, later ones in that window are merged into one more pass.
  const PLACE_COOLDOWN_MS = 250;
  let placeScheduled = false;
  let coolingDown = false;
  let changedDuringCooldown = false;
  function requestPlace() {
    if (btn.hidden) return;
    if (coolingDown) {
      changedDuringCooldown = true;
      return;
    }
    if (placeScheduled) return;
    placeScheduled = true;
    requestAnimationFrame(() => {
      placeScheduled = false;
      place();
      coolingDown = true;
      setTimeout(() => {
        coolingDown = false;
        if (changedDuringCooldown) {
          changedDuringCooldown = false;
          requestPlace();
        }
      }, PLACE_COOLDOWN_MS);
    });
  }
  new MutationObserver(requestPlace).observe(document.body, { childList: true, subtree: true });

  // Onshape is a single-page app: tab switches change the URL without a page
  // load. Re-check whenever the URL changes.
  let lastHref = "";
  // Retries after a failed element-type check (e.g. a 401 while Onshape is
  // still loading), so one transient error doesn't hide the button for good.
  const RETRY_DELAYS_MS = [2000, 5000, 15000];
  let retryHref = "";
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  async function refresh() {
    if (location.href === lastHref) return;
    const href = location.href;
    lastHref = href;
    clearTimeout(retryTimer);
    if (href !== retryHref) {
      retryHref = href;
      retryCount = 0;
    }
    const loc = parseLocation();
    if (!loc) {
      setVisible(false);
      return;
    }
    try {
      const type = await getElementType(loc);
      if (location.href === href) setVisible(type === "ASSEMBLY");
    } catch (err) {
      console.warn("[Demacia BOM] could not determine element type", err);
      // A late failure for a page the user already left must not hide the
      // button of the page now shown.
      if (location.href !== href) return;
      setVisible(false);
      if (retryCount < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[retryCount++];
        retryTimer = setTimeout(() => {
          if (location.href !== href) return;
          lastHref = ""; // let refresh() check this same URL again
          refresh();
        }, delay);
      }
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
