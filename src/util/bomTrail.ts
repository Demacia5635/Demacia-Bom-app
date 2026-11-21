/**
 * The assemblies you came through to reach a BOM page (Robot › Arm ›
 * Gripper), kept in its address as ?trail=<id>,<id> so the breadcrumbs
 * survive a reload or a shared link (QW3).
 */

/** The trail in the address (ids from the top assembly down, not the current one). */
export function readTrail(params: URLSearchParams): string[] {
  const raw = params.get("trail");
  return raw ? raw.split(",").filter(Boolean).map((id) => decodeURIComponent(id)) : [];
}

/** The address of a BOM page reached through `trail`. */
export function bomPath(bomId: string, trail: string[] = []): string {
  const query = trail.length > 0 ? `?trail=${trail.map((id) => encodeURIComponent(id)).join(",")}` : "";
  return `/bom/${encodeURIComponent(bomId)}${query}`;
}
