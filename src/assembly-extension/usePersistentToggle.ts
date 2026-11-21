/**
 * A panel view option (a checkbox) remembered in this browser. False when
 * storage is unavailable; it still works for the session.
 */
import { useEffect, useState } from "react";

const TOGGLE_STORAGE_PREFIX = "demacia-bom:";

function readToggle(name: string): boolean {
  try {
    return localStorage.getItem(TOGGLE_STORAGE_PREFIX + name) === "1";
  } catch {
    return false;
  }
}

function writeToggle(name: string, on: boolean) {
  try {
    localStorage.setItem(TOGGLE_STORAGE_PREFIX + name, on ? "1" : "0");
  } catch {
    // Not remembered; it still works for this session.
  }
}

/** Like useState(false), but read from and written to localStorage under `name`. */
export function usePersistentToggle(name: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => readToggle(name));
  useEffect(() => writeToggle(name, on), [name, on]);
  return [on, setOn];
}
