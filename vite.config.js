import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

// The website's own version, shown in the top bar (components/Appbar.tsx).
// It's separate from package.json's version, which is the extension's.
// Bump it on every website deploy: +0.0.1 for a deploy, +0.1.0 for a medium
// update, +1.0.0 for a large one (see src/upd. logs/README.md).
const { version } = JSON.parse(readFileSync(new URL('./site-version.json', import.meta.url), 'utf8'));

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // A website build needs the server's address: without it, the site would
  // quietly talk to the hard-coded production server (ApiService.tsx). Set it
  // in .env.local, or as the VITE_CLIENT_URL repository secret for the deploy
  // (.github/workflows/deploy.yml). `npm run dev` doesn't need it (localhost).
  if (command === 'build' && !loadEnv(mode, process.cwd(), 'VITE_').VITE_CLIENT_URL) {
    throw new Error('VITE_CLIENT_URL is not set: add it to .env.local (or the deploy secrets) before building the website.');
  }

  return {
    plugins: [react(), tailwindcss()],
    base: '/Demacia-Bom-app/',
    define: { __APP_VERSION__: JSON.stringify(version) },
    server: {
      port: 5173,
      proxy: {
        // Forward any request starting with /api to your Express backend
        '/api': {
          target: 'http://localhost:5050',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
