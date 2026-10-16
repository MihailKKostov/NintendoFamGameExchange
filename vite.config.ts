import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo-name>/. The deploy workflow sets
// BASE_PATH; locally we serve from the root.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  // One ~200 kB (gzipped) bundle: React + supabase-js + the app. Fine for this use.
  build: { chunkSizeWarningLimit: 900 },
});
