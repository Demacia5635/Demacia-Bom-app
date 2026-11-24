import { useEffect, useState } from "react";
import { ApiRequestError, fetchFromApi } from "./ApiService";

/**
 * "Admin pages" in this browser: after the server accepts the admin secret
 * once (#/admin), the sidebar shows the unlisted pages at its bottom until
 * they're locked again. Only that flag is remembered (localStorage), never
 * the secret: the pages it links to are open to anyone with the address, and
 * actions that need the secret (deletes) still ask for it, once per tab.
 */
const UNLOCKED_KEY = "bom-admin-unlocked";
/** The admin secret for this tab only (sessionStorage), once it worked. */
const TAB_SECRET_KEY = "bom-admin-secret";
const CHANGE_EVENT = "bom-admin-unlock-change";

export function isAdminUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCKED_KEY) === "1";
  } catch {
    return false;
  }
}

function setAdminUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) localStorage.setItem(UNLOCKED_KEY, "1");
    else localStorage.removeItem(UNLOCKED_KEY);
  } catch {
    // Storage blocked: nothing is remembered.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Whether this browser shows the admin pages; follows Unlock / Lock (this tab and others). */
export function useAdminUnlocked(): boolean {
  const [unlocked, setUnlocked] = useState(isAdminUnlocked);
  useEffect(() => {
    const update = () => setUnlocked(isAdminUnlocked());
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener("storage", update); // another tab
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return unlocked;
}

/** The admin secret kept for this tab, or "". */
export function readTabSecret(): string {
  try {
    return sessionStorage.getItem(TAB_SECRET_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Keeps (or with null, forgets) the admin secret for this tab. */
export function writeTabSecret(secret: string | null): void {
  try {
    if (secret) sessionStorage.setItem(TAB_SECRET_KEY, secret);
    else sessionStorage.removeItem(TAB_SECRET_KEY);
  } catch {
    // Storage blocked: the secret is typed again next time.
  }
  window.dispatchEvent(new Event(TAB_SECRET_EVENT));
}

const TAB_SECRET_EVENT = "bom-admin-tab-secret-change";

/** Whether this tab has the admin secret; follows writeTabSecret. */
export function useHasTabSecret(): boolean {
  const [has, setHas] = useState(() => !!readTabSecret());
  useEffect(() => {
    const update = () => setHas(!!readTabSecret());
    window.addEventListener(TAB_SECRET_EVENT, update);
    return () => window.removeEventListener(TAB_SECRET_EVENT, update);
  }, []);
  return has;
}

/** Checks the secret with the server and keeps it for this tab (no unlock). Throws the server's error. */
export async function enterTabSecret(secret: string): Promise<void> {
  await fetchFromApi<null>("/admin/check", { headers: { "x-admin-secret": secret } });
  writeTabSecret(secret);
}

/**
 * fetchFromApi for an admin-only route: sends this tab's admin secret. A 404
 * (wrong secret, e.g. it was changed) forgets it, so AdminGate asks again.
 */
export async function adminFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    return await fetchFromApi<T>(endpoint, { ...options, headers: { ...options.headers, "x-admin-secret": readTabSecret() } });
  } catch (err) {
    if (err instanceof ApiRequestError && err.statusCode === 404) writeTabSecret(null);
    throw err;
  }
}

/** The message for a refused admin secret: wrong (404), too many tries (429, the server's text), or another failure. */
export function adminSecretError(err: unknown): string {
  if (err instanceof ApiRequestError && err.statusCode === 404) return "Wrong admin secret.";
  if (err instanceof ApiRequestError && err.statusCode === 429) return err.message || "Too many wrong admin secrets. Try again in 15 minutes.";
  return `Couldn't check it: ${(err as Error)?.message || err}`;
}

/**
 * Checks the secret with the server (GET /admin/check: 204 right, 404 wrong,
 * 429 too many wrong tries) and, if it's right, unlocks this browser. Throws
 * the server's error otherwise.
 */
export async function unlockAdmin(secret: string): Promise<void> {
  await fetchFromApi<null>("/admin/check", { headers: { "x-admin-secret": secret } });
  writeTabSecret(secret);
  setAdminUnlocked(true);
}

/** Hides the admin pages again, and forgets this tab's secret. */
export function lockAdmin(): void {
  writeTabSecret(null);
  setAdminUnlocked(false);
}
