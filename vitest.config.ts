/**
 * Unit tests (QX1): `npm test` runs every src/**\/*.test.ts once. Pure logic
 * only (no browser), so the tests don't load the website's vite.config.js.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
