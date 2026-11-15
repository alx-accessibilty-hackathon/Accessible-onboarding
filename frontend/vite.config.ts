import fs from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Unknown pages get the friendly 404 page (with a 404 status) instead of the sign-up page.
 * Vite's 'mpa' mode already stops sending index.html for every address; this serves 404.html
 * for page requests that match no file. (In production nginx does it: error_page 404.)
 */
function notFoundPage(): Plugin {
  const root = path('./');
  return {
    name: 'bridge-404',
    configureServer(server) {
      // Returned: runs after Vite's own middlewares have had their chance (files, modules).
      return () => {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const wantsPage = (req.headers.accept ?? '').includes('text/html');
          const isPage = url.pathname.endsWith('/') || /\.html?$|\/[^.]*$/.test(url.pathname);
          if (req.method === 'GET' && wantsPage && url.pathname.startsWith('/r/')) {
            const html = await server.transformIndexHtml(
              '/index.html',
              fs.readFileSync(`${root}index.html`, 'utf8'),
            );
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
            return;
          }
          let exists = false;
          try {
            exists = fs.statSync(path(`.${decodeURIComponent(url.pathname)}`)).isFile();
          } catch {
            exists = false;
          }
          if (req.method !== 'GET' || !wantsPage || !isPage || exists) return next();
          const html = await server.transformIndexHtml(
            '/404.html',
            fs.readFileSync(`${root}404.html`, 'utf8'),
          );
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        });
      };
    },
  };
}

// App build: our hosted sign-up page, the staff pages and the demo host pages.
// The widget file itself is built by vite.widget.config.ts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), notFoundPage()],
    // Multi-page: an unknown address is a 404, never the sign-up page (SPA fallback).
    appType: 'mpa',
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
          partners: path('./partners.html'),
          docs: path('./docs.html'),
          notFound: path('./404.html'),
          plain: path('./demo/plain.html'),
          'demo-components': path('./demo/components.html'),
          'savanna-signup': path('./demo/savanna/signup.html'),
          'savanna-home': path('./demo/savanna/home.html'),
          'savanna-jobs': path('./demo/savanna/jobs.html'),
          'savanna-profile': path('./demo/savanna/profile.html'),
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
