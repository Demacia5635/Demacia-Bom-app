import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

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
