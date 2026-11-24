/**
 * "Update available": the newest extension version, read from the website's
 * public/extension-version.json ({ version }), which the release script writes
 * once a new version's builds are in the team's Drive folder. Checked when the
 * panel opens and every 6 hours while it stays open; one fetch an hour at most.
 */
import { useEffect, useState } from "react";
import { WEBSITE_URL } from "./websiteLinks";

/** The team's Drive folder with every version's builds (where the tag links). */
export const DOWNLOADS_URL = "https://drive.google.com/drive/folders/1vUUQHNbdRuvrmLKqdWH8-tYY2qXV1uNa?hl=he";

const VERSION_URL = `${WEBSITE_URL}extension-version.json`;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const REMEMBER_MS = 60 * 60 * 1000;
const CACHE_KEY = "demacia-bom:latestVersion";

/** Compares "5.0.1"-style versions: >0 when a is newer. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The running extension's version ("" outside the extension). */
export function runningVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "";
  }
}

function readCache(): { version: string; at: number } | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    return c && typeof c.version === "string" && typeof c.at === "number" ? c : null;
  } catch {
    return null;
  }
}

/** The newest published version, or null when unknown (offline, no file yet). */
async function fetchLatest(): Promise<string | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.at < REMEMBER_MS) return cached.version;
  try {
    const res = await fetch(VERSION_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const { version } = (await res.json()) as { version?: unknown };
    if (typeof version !== "string" || !/^\d+(\.\d+)*$/.test(version)) return null;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version, at: Date.now() }));
    } catch {
      // not remembered: asked again next time
    }
    return version;
  } catch {
    return null; // the website is unreachable: no tag
  }
}

/** The newer version available than the running one, or null. */
export function useUpdateAvailable(): { latest: string; current: string } | null {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      void fetchLatest().then((v) => {
        if (!cancelled && v) setLatest(v);
      });
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const current = runningVersion();
  return latest && current && compareVersions(latest, current) > 0 ? { latest, current } : null;
}
