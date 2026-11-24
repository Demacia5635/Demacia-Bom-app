/** Formatting for the #/server page. */

export function formatUptime(seconds?: number): string {
  if (seconds == null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/** "192.168.1.23" → "192.168.1.•", an IPv6 keeps its first half: enough to tell people apart on the page. */
export function maskIp(ip: string): string {
  if (ip.includes(".")) return ip.replace(/\.\d+$/, ".•");
  const parts = ip.split(":");
  return parts.length > 4 ? `${parts.slice(0, 4).join(":")}:…` : ip;
}

/**
 * A job's summary as "moved 300 · already in place 150 · skipped 3": numbers
 * as they are, a { reason: n } object summed.
 */
export function jobCounts(obj?: Record<string, unknown> | null): string {
  if (!obj) return "";
  const label = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return Object.entries(obj)
    .map(([k, v]) => {
      if (typeof v === "number") return `${label(k)} ${v}`;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const sum = Object.values(v).reduce<number>((n, x) => n + (typeof x === "number" ? x : 0), 0);
        return sum > 0 ? `${label(k)} ${sum}` : "";
      }
      return "";
    })
    .filter(Boolean)
    .join(" · ");
}
