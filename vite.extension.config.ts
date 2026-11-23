/**
 * Builds for the browser extension (side panel + background worker + in-page button).
 *
 *   npm run build:extension           -> dist-extension/          Chrome (chrome://extensions > Load unpacked)
 *   npm run build:extension:firefox   -> dist-extension-firefox/  Firefox (about:debugging > Load Temporary Add-on)
 *   npm run watch:extension           -> Chrome build, rebuilt on every change
 *
 * Both targets share the panel and content script. They differ in the manifest
 * and the background script: Chrome uses chrome.sidePanel, Firefox uses
 * sidebarAction (see background.firefox.ts). The Firefox config is
 * vite.extension.firefox.config.ts, which calls createExtensionConfig('firefox').
 *
 * Separate from vite.config.js so the GitHub Pages web app build is untouched.
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

export type ExtensionTarget = 'chrome' | 'firefox';

const ROOT = dirname(fileURLToPath(import.meta.url));
const EXT_DIR = resolve(ROOT, 'extension');
const MANIFEST_PATH = resolve(EXT_DIR, 'manifest.json');

// Same fallback the web app's SignIn page uses.
const DEFAULT_BACKEND_URL = 'https://demacia-bom-app-n2ag.onrender.com';

/** Firefox add-on ID (stands in for Chrome's "key": keeps the ID stable across installs). */
const FIREFOX_ADDON_ID = 'demacia-bom@demacia5635';

/**
 * Turns the Chrome manifest (extension/manifest.json, the source of truth) into
 * the Firefox one: sidebar_action instead of side_panel, background scripts
 * instead of a service worker, and a gecko ID instead of "key".
 */
function toFirefoxManifest(manifest: Record<string, unknown>): Record<string, unknown> {
  const {
    key: _key,
    minimum_chrome_version: _minChrome,
    side_panel: _sidePanel,
    background: _background,
    permissions,
    ...rest
  } = manifest;
  return {
    ...rest,
    permissions: (permissions as string[]).filter((p) => p !== 'sidePanel'),
    background: { scripts: ['background.js'], type: 'module' },
    sidebar_action: {
      default_title: 'Demacia BOM',
      default_panel: 'panel.html',
      open_at_install: false,
    },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ADDON_ID,
        // Firefox 140 brought the built-in data-collection consent the key below uses.
        strict_min_version: '140.0',
        // What the extension sends to the team's server (the user's decision):
        // the Onshape name / email, the BOM read from Onshape, and, only if the
        // user allows it, usage statistics (/tele; telemetryConsent.ts).
        data_collection_permissions: {
          required: ['personallyIdentifyingInfo', 'websiteContent'],
          optional: ['technicalAndInteraction'],
        },
      },
      // Firefox for Android has the data-collection key from 142.
      gecko_android: { strict_min_version: '142.0' },
    },
  };
}

/**
 * Emits manifest.json with the version from package.json and the backend's
 * origin added to host_permissions (so the side panel can call it without CORS
 * depending on the extension's origin).
 */
function manifestPlugin(backendUrl: string, target: ExtensionTarget): Plugin {
  return {
    name: 'demacia-extension-manifest',
    buildStart() {
      this.addWatchFile(MANIFEST_PATH);
    },
    generateBundle() {
      let manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
      const backendPattern = `${new URL(backendUrl).origin}/*`;

      manifest.version = pkg.version;
      manifest.host_permissions = [...new Set([...manifest.host_permissions, backendPattern])];
      if (target === 'firefox') manifest = toFirefoxManifest(manifest);

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifest, null, 2),
      });
    },
  };
}

/**
 * The Demacia logo for the in-page BOM button, from the web app's favicon so
 * there's one source. content.ts draws it as an inline <svg> (no extension
 * file the Onshape page could probe for, and nothing for the page's CSP to
 * block), so only the shapes are passed: the favicon is one path in one group.
 */
function readLogo(): { viewBox: string; transform: string; d: string } {
  const svg = readFileSync(resolve(ROOT, 'public/favicon.svg'), 'utf8');
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  const transform = svg.match(/<g[^>]*\stransform="([^"]+)"/)?.[1] ?? '';
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
  if (!viewBox || paths.length === 0) throw new Error('public/favicon.svg: no viewBox or path for the extension logo');
  return { viewBox, transform, d: paths.join(' ') };
}

export function createExtensionConfig(target: ExtensionTarget) {
  return defineConfig(({ mode }) => {
    const env = loadEnv(mode, ROOT, 'VITE_');
    const backendUrl = env.VITE_CLIENT_URL || DEFAULT_BACKEND_URL;

    return {
      root: EXT_DIR,
      base: '/',
      envDir: ROOT,
      publicDir: resolve(EXT_DIR, 'public'),
      define: { __DEMACIA_LOGO__: JSON.stringify(readLogo()) },
      plugins: [react(), tailwindcss(), manifestPlugin(backendUrl, target)],
      build: {
        outDir: resolve(ROOT, target === 'firefox' ? 'dist-extension-firefox' : 'dist-extension'),
        emptyOutDir: true,
        // Extension pages forbid inline scripts; keep the output free of them.
        modulePreload: { polyfill: false },
        rollupOptions: {
          input: {
            panel: resolve(EXT_DIR, 'panel.html'),
            background: resolve(
              ROOT,
              target === 'firefox' ? 'src/extension/background.firefox.ts' : 'src/extension/background.ts'
            ),
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
}

export default createExtensionConfig('chrome');
