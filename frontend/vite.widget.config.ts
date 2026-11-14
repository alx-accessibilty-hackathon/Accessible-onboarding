import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Builds the one file partners load with a script tag: dist-widget/bridge-onboarding.js
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': path('../shared') },
  },
  // Library builds don't replace this automatically; React needs it to use its small production build.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist-widget',
    emptyOutDir: true,
    copyPublicDir: false,
    lib: {
      entry: path('./src/widget/element.tsx'),
      name: 'BridgeOnboarding',
      formats: ['iife'],
      fileName: () => 'bridge-onboarding.js',
    },
  },
});
