// Robust host resolution: Checks hostname for local dev, falls back to explicit Render production URL
// (its own module so ApiService.tsx and images.ts can both use it).
export const BACKEND_HOST = (typeof window !== "undefined" && window.location.hostname === "localhost")
  ? "http://localhost:5050"
  : (import.meta.env.VITE_CLIENT_URL || "https://demacia-bom-app-n2ag.onrender.com");
