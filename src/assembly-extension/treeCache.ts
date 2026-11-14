/**
 * Saved copy of each resolved assembly tree, so reopening an assembly shows
 * its last tree at once while AssemblyBomPage reloads the fresh one in the
 * background.
 *
 * Stored in localStorage (per browser; the Chrome extension and the web app
 * each have their own). Every access is wrapped: storage can be unavailable or
 * full, and the page must work without it. Only the most recent MAX_ENTRIES
 * trees are kept.
 */
import type AssemblyBomRow from "./AssemblyBomRow";
import type { BomModel } from "../util/Models";
import type { OnshapeKey } from "./BomApi";

/** Bump when the stored shape changes, so old copies are ignored. */
// 2: saved-image addresses gained the /api prefix.
// 3: rows from Onshape (+ pending edits, saved file IDs); root keeps description/part number.
// 4: assembly images are live renders instead of Onshape's stored thumbnails.
// 5: rows track baseline/loaded values for change marking.
// 6: rows carry isStandardContent.
const VERSION = 6;
const PREFIX = "demacia-bom-tree:";
const INDEX_KEY = "demacia-bom-tree-index";
const MAX_ENTRIES = 20;

export interface CachedTree {
  v: number;
  savedAt: number;
  rows: AssemblyBomRow[];
  rootBomDB: BomModel | null;
  /** Just what the page reads from the root Onshape BOM. */
  rootBom: { id: string; name: string; description?: string; partNumber?: string } | null;
}

export function treeCacheKey(k: OnshapeKey): string {
  return `${PREFIX}${k.documentID}/${k.wvmType}/${k.wvmID}/${k.elementID}`;
}

function readIndex(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeIndex(index: Record<string, number>): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* ignore */
  }
}

function remove(key: string, index: Record<string, number>): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  delete index[key];
}

export function readTreeCache(key: string): CachedTree | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTree;
    return parsed?.v === VERSION && Array.isArray(parsed.rows) ? parsed : null;
  } catch {
    return null;
  }
}

/** `savedAt`: when the tree was loaded from Onshape (defaults to now). */
export function writeTreeCache(key: string, data: Omit<CachedTree, "v" | "savedAt">, savedAt: number = Date.now()): void {
  const entry: CachedTree = { v: VERSION, savedAt, ...data };
  const json = JSON.stringify(entry);
  const index = readIndex();

  let saved = false;
  try {
    localStorage.setItem(key, json);
    saved = true;
  } catch {
    // Probably full: drop every other saved tree and try once more.
    for (const other of Object.keys(index)) {
      if (other !== key) remove(other, index);
    }
    try {
      localStorage.setItem(key, json);
      saved = true;
    } catch {
      /* too big to store; the page works without it */
    }
  }

  if (saved) index[key] = entry.savedAt;
  else delete index[key];

  // Keep only the most recent trees.
  const byAge = Object.entries(index).sort((a, b) => b[1] - a[1]);
  for (const [oldKey] of byAge.slice(MAX_ENTRIES)) remove(oldKey, index);
  writeIndex(index);
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function describeAge(savedAt: number): string {
  const minutes = Math.round((Date.now() - savedAt) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
