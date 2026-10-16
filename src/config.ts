import type { FirebaseOptions } from 'firebase/app';

/**
 * Firebase web config, from Firebase console → Project settings → Your apps.
 * Paste it into VITE_FIREBASE_CONFIG as JSON — or as the JavaScript object the
 * console shows; both are accepted.
 */
function parseFirebaseConfig(raw: string | undefined): FirebaseOptions | null {
  if (!raw || !raw.trim()) return null;
  let text = raw.trim().replace(/^[^{]*/, '').replace(/[^}]*$/, '');
  try {
    return JSON.parse(text);
  } catch {
    // Turn `{ apiKey: "x", }` into JSON.
    text = text
      .replace(/\/\/.*$/gm, '')
      .replace(/'/g, '"')
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/,\s*}/g, '}');
    try {
      return JSON.parse(text);
    } catch {
      console.error('VITE_FIREBASE_CONFIG could not be parsed — running in demo mode.');
      return null;
    }
  }
}

const firebase = parseFirebaseConfig(import.meta.env.VITE_FIREBASE_CONFIG as string | undefined);

export const config = {
  firebase,
  /** Without a Firebase config the app runs fully in the browser with sample data. */
  demo: !firebase?.apiKey || !firebase?.projectId,
  functionsRegion: (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION as string | undefined)?.trim() || 'us-central1',
  useEmulators: String(import.meta.env.VITE_USE_FIREBASE_EMULATORS ?? '').toLowerCase() === 'true',
  appName: 'Family Game Exchange',
};

/** Absolute URL of the app (works on GitHub Pages sub-paths). */
export function appBaseUrl(): string {
  return window.location.origin + window.location.pathname.replace(/index\.html$/, '');
}
