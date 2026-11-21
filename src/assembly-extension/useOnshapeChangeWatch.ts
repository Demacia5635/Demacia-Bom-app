/**
 * Notices when the assembly changed in Onshape since the tree on screen was
 * loaded: every minute while the panel is visible, the change markers of the
 * tree's Onshape tabs (one small request per document, as Publish BOM's
 * check) are compared with the ones read right after the load. Tabs added to
 * the tree since (e.g. an unmarked assembly's insides) just join the list.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type AssemblyBomRow from "./AssemblyBomRow";
import type { OnshapeKey } from "./BomApi";
import { computeModelVersions } from "./modelVersions";
import { keyString } from "./onshapeKeys";
import { createLimiter } from "./requestPool";

const CHECK_EVERY_MS = 60_000;

/** Each Onshape tab of the tree (the top assembly included) -> its change marker, when known. */
async function tabVersions(rootKey: OnshapeKey, rows: AssemblyBomRow[]): Promise<Map<string, string> | null> {
  const root = { ...rootKey, id: "__root__" } as unknown as AssemblyBomRow;
  const all = [root, ...rows];
  const versions = await computeModelVersions(all, createLimiter(4)).catch(() => null);
  if (!versions) return null;
  const byTab = new Map<string, string>();
  for (const r of all) {
    const v = versions.byRow.get(r.id);
    if (v) byTab.set(keyString(r), v);
  }
  return byTab;
}

export function useOnshapeChangeWatch({
  rootKey,
  rows,
  active,
}: {
  rootKey: OnshapeKey | null;
  rows: AssemblyBomRow[];
  /** Watching: a tree from Onshape is on screen (not a saved copy) and nothing is loading or publishing. */
  active: boolean;
}): { changed: boolean; restart: () => void } {
  const [changed, setChanged] = useState(false);
  /** The markers taken as "as loaded"; null until the first check after a (re)start. */
  const baseline = useRef<Map<string, string> | null>(null);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  /** Forget the old markers: the next check takes the current ones as the starting point. */
  const restart = useCallback(() => {
    baseline.current = null;
    setChanged(false);
  }, []);

  useEffect(() => {
    if (!active || !rootKey) return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const now = await tabVersions(rootKey, rowsRef.current);
      if (cancelled || !now) return;
      if (baseline.current === null) {
        baseline.current = now;
        return;
      }
      for (const [tab, version] of now) {
        const before = baseline.current.get(tab);
        if (before === undefined) baseline.current.set(tab, version);
        else if (before !== version) setChanged(true);
      }
    };
    if (baseline.current === null) void check(); // the starting point, right away
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, rootKey]);

  return { changed, restart };
}
