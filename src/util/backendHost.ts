// Robust host resolution: Checks hostname for local dev, falls back to explicit Render production URL
// (its own module so ApiService.ts and images.ts can both use it).
export const BACKEND_HOST = (typeof window !== "undefined" && window.location.hostname === "localhost")
  ? "http://localhost:5050"
  : (import.meta.env.VITE_CLIENT_URL || "https://demacia-bom-app-n2ag.onrender.com");

/**
 * The full URL of a server route, for code that calls fetch itself (or builds
 * links): `apiUrl("/telemetry/events")` → `<server>/api/telemetry/events`.
 * The path may start with or without "/" or "/api", as with fetchFromApi.
 * The server is localhost:5050 when run locally, else VITE_CLIENT_URL (or the
 * production URL when that isn't set).
 */
export function apiUrl(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  const clean = withSlash === "/api" || withSlash.startsWith("/api/") ? withSlash.slice(4) : withSlash;
  return `${BACKEND_HOST}/api${clean}`;
}

/**
 * Where to fetch a file or image src from: a full URL as it is, "/api/..." on
 * our server (as apiUrl), any other path relative to the server.
 */
export function serverUrl(src: string): string {
  if (/^https?:\/\//.test(src)) return src;
  if (src === "/api" || src.startsWith("/api/")) return apiUrl(src);
  return `${BACKEND_HOST}${src.startsWith("/") ? src : `/${src}`}`;
}
