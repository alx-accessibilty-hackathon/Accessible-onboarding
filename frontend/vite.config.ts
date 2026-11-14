import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// App build: our hosted sign-up page, the staff pages and the demo host pages.
// The widget file itself is built by vite.widget.config.ts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: { '@shared': path('../shared') },
    },
    server: {
      port: 5173,
      // Lets the co-designer open the dev server on their phone through a Cloudflare quick tunnel.
      allowedHosts: ['.trycloudflare.com'],
      // Allows importing the flow files from ../shared.
      fs: { allow: ['..'] },
      // Same-site API calls in development: /api/* goes to the Go API.
      proxy: { '/api': env.VITE_API_PROXY_TARGET || 'http://localhost:8080' },
    },
    build: {
      rollupOptions: {
        input: {
          main: path('./index.html'),
          staff: path('./staff.html'),
          plain: path('./demo/plain.html'),
          'demo-components': path('./demo/components.html'),
          'savanna-signup': path('./demo/savanna/signup.html'),
          'savanna-home': path('./demo/savanna/home.html'),
          'savanna-jobs': path('./demo/savanna/jobs.html'),
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
