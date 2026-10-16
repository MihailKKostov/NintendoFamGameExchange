import type { FirebaseOptions } from 'firebase/app';

const KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId', 'databaseURL'] as const;

/**
 * Read the Firebase web config from whatever was pasted: plain JSON, the
 * `const firebaseConfig = {…}` object, or the console's whole code snippet
 * (imports, comments and all).
 */
export function parseFirebaseConfig(raw: string | undefined | null): FirebaseOptions | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const json = JSON.parse(text);
    if (json && typeof json === 'object' && json.apiKey && json.projectId) return json as FirebaseOptions;
  } catch {
    /* not JSON — fall through */
  }
  const out: Record<string, string> = {};
  const re = new RegExp(`["']?\\b(${KEYS.join('|')})\\b["']?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`, 'g');
  for (const m of text.matchAll(re)) out[m[1]] ??= m[2].trim();
  return out.apiKey && out.projectId ? (out as FirebaseOptions) : null;
}
