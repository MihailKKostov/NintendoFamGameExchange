import { parseFirebaseConfig } from './lib/firebaseConfig';

const raw = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
const firebase = parseFirebaseConfig(raw);
/** Demo mode (sample data in the browser) only ever runs locally, or when explicitly asked for. */
const demoAllowed = import.meta.env.DEV || String(import.meta.env.VITE_DEMO ?? '').toLowerCase() === 'true';

export const config = {
  firebase,
  /** No backend: run fully in the browser with sample data. */
  demo: !firebase && demoAllowed,
  /** A published build without a usable Firebase config: show setup help, never sample data. */
  missing: !firebase && !demoAllowed,
  /** Something was provided but couldn't be read. */
  unreadable: !!raw?.trim() && !firebase,
  functionsRegion: (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION as string | undefined)?.trim() || 'europe-west1',
  useEmulators: String(import.meta.env.VITE_USE_FIREBASE_EMULATORS ?? '').toLowerCase() === 'true',
  appName: 'Family Game Exchange',
};

/** Absolute URL of the app (works on GitHub Pages sub-paths). */
export function appBaseUrl(): string {
  return window.location.origin + window.location.pathname.replace(/index\.html$/, '');
}
