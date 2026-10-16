import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The app module is loaded with a dynamic import (see main.tsx), so the browser
 * would only discover it — and React and Firebase behind it — after main.js has
 * downloaded and run. Listing them in the HTML lets them all download at once.
 */
function preloadApp(): Plugin {
  return {
    name: 'preload-app',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return;
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
        const app = chunks.find((c) => c.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/App.tsx'));
        if (!app) return;
        const files = new Set<string>();
        const visit = (name: string) => {
          if (files.has(name)) return;
          files.add(name);
          const c = bundle[name];
          if (c?.type === 'chunk') c.imports.forEach(visit);
        };
        visit(app.fileName);
        const font = Object.keys(bundle).find((f) => /nunito-latin-wght-normal.*\.woff2$/.test(f));
        const base = ctx.server ? '/' : (process.env.BASE_PATH || '/');
        return [
          ...[...files].filter((f) => !html.includes(f)).map((f) => ({
            tag: 'link',
            attrs: { rel: 'modulepreload', crossorigin: true, href: base + f },
            injectTo: 'head' as const,
          })),
          ...(font
            ? [{ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true, href: base + font }, injectTo: 'head' as const }]
            : []),
        ];
      },
    },
  };
}

// GitHub Pages serves the site from /<repo-name>/. The deploy workflow sets
// BASE_PATH; locally we serve from the root.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), preloadApp()],
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Separate, long-cached vendor chunks so app updates download little.
        codeSplitting: {
          groups: [
            // Storage stays out: it's only loaded when someone uploads a picture.
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/](?!storage)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@tanstack)[\\/]/ },
          ],
        },
      },
    },
  },
});
