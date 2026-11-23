/**
 * Firefox only: the usage statistics sent to the team's server (/tele) are
 * "technicalAndInteraction" data, which Firefox lets the user allow or refuse
 * (manifest: browser_specific_settings.gecko.data_collection_permissions,
 * optional). Until it's allowed, telemetry.ts sends nothing. Chrome has no
 * such setting: telemetry is always on there, as before.
 */
const CATEGORY = "technicalAndInteraction";
const ASKED_KEY = "demacia-bom:telemetryConsentAsked";

interface DataCollectionPermissions {
  contains(p: { data_collection: string[] }): Promise<boolean>;
  request(p: { data_collection: string[] }): Promise<boolean>;
  onAdded?: { addListener(cb: () => void): void };
  onRemoved?: { addListener(cb: () => void): void };
}

/** Firefox's sidebar (Chrome has chrome.sidePanel). */
export const isFirefox = (): boolean => typeof chrome !== "undefined" && !("sidePanel" in chrome);

function permissionsApi(): DataCollectionPermissions | null {
  const b = (globalThis as unknown as { browser?: { permissions?: DataCollectionPermissions } }).browser;
  return b?.permissions ?? null;
}

/** Known answer: true on Chrome; on Firefox false until the check below says it's allowed. */
let allowed = !isFirefox();
let checked: Promise<boolean> | null = null;

/** Asks Firefox whether the user allowed it (at install, in the add-on's settings, or with our prompt). */
export function checkTelemetryConsent(): Promise<boolean> {
  if (!isFirefox()) return Promise.resolve(true);
  checked ??= (async () => {
    try {
      allowed = !!(await permissionsApi()?.contains({ data_collection: [CATEGORY] }));
    } catch {
      allowed = false; // a Firefox without data-collection consent: send nothing
    }
    return allowed;
  })();
  return checked;
}

// The user can change it in the add-on's settings at any time.
if (isFirefox()) {
  const api = permissionsApi();
  const recheck = () => {
    checked = null;
    void checkTelemetryConsent();
  };
  try {
    api?.onAdded?.addListener(recheck);
    api?.onRemoved?.addListener(recheck);
  } catch {
    // no events on this version: the check on each panel start still applies
  }
  void checkTelemetryConsent();
}

/** Whether usage statistics may be sent right now (synchronous: for the send on closing the panel). */
export const telemetryAllowedNow = (): boolean => allowed;

/** Show the in-panel question: Firefox, not allowed, and not answered before. */
export async function shouldAskTelemetryConsent(): Promise<boolean> {
  if (!isFirefox() || !permissionsApi()) return false;
  if (await checkTelemetryConsent()) return false;
  try {
    return localStorage.getItem(ASKED_KEY) === null;
  } catch {
    return false; // can't remember the answer: don't nag on every start
  }
}

/** Remembers that the question was answered (Allow or No thanks), so it isn't asked again. */
function rememberAnswered(): void {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // not remembered; asked again next time
  }
}

/** "Allow": Firefox's own permission prompt. Must run inside the click handler. */
export async function requestTelemetryConsent(): Promise<boolean> {
  rememberAnswered();
  try {
    allowed = !!(await permissionsApi()?.request({ data_collection: [CATEGORY] }));
  } catch {
    allowed = false;
  }
  checked = Promise.resolve(allowed);
  return allowed;
}

/** "No thanks". */
export function declineTelemetryConsent(): void {
  rememberAnswered();
}
