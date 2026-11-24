import { useEffect, useState } from "react";
import { fetchFromApi } from "./ApiService";

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
