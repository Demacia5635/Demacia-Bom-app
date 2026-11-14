/**
 * Build for the Chrome extension (side panel + background worker + in-page button).
 *
 *   npm run build:extension   -> dist-extension/  (load it via chrome://extensions > Load unpacked)
 *   npm run watch:extension   -> same, rebuilt on every change
 *
 * Separate from vite.config.js so the GitHub Pages web app build is untouched.
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const ROOT = dirname(fileURLToPath(import.meta.url));
const EXT_DIR = resolve(ROOT, 'extension');
const MANIFEST_PATH = resolve(EXT_DIR, 'manifest.json');

// Same fallback the web app's SignIn page uses.
const DEFAULT_BACKEND_URL = 'https://demacia-bom-app-n2ag.onrender.com';

/**
 * Emits manifest.json with the version from package.json and the backend's
 * origin added to host_permissions (so the side panel can call it without CORS
 * depending on the extension's origin).
 */
function manifestPlugin(backendUrl: string): Plugin {
  return {
    name: 'demacia-extension-manifest',
    buildStart() {
      this.addWatchFile(MANIFEST_PATH);
    },
    generateBundle() {
      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
      const backendPattern = `${new URL(backendUrl).origin}/*`;

      manifest.version = pkg.version;
      manifest.host_permissions = [...new Set([...manifest.host_permissions, backendPattern])];

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifest, null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT, 'VITE_');
  const backendUrl = env.VITE_CLIENT_URL || DEFAULT_BACKEND_URL;

  return {
    root: EXT_DIR,
    base: '/',
    envDir: ROOT,
    publicDir: resolve(EXT_DIR, 'public'),
    plugins: [react(), tailwindcss(), manifestPlugin(backendUrl)],
    build: {
      outDir: resolve(ROOT, 'dist-extension'),
      emptyOutDir: true,
      // Extension pages forbid inline scripts; keep the output free of them.
      modulePreload: { polyfill: false },
      rollupOptions: {
        input: {
          panel: resolve(EXT_DIR, 'panel.html'),
          background: resolve(ROOT, 'src/extension/background.ts'),
          // Content scripts run as classic scripts: content.ts must not import anything.
          content: resolve(ROOT, 'src/extension/content.ts'),
        },
        output: {
          // manifest.json references background.js / content.js by fixed name.
          entryFileNames: (chunk) =>
            chunk.name === 'panel' ? 'assets/[name]-[hash].js' : '[name].js',
        },
      },
    },
  };
});
