const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const config = {
  supabaseUrl: url || '',
  supabaseAnonKey: anonKey || '',
  /** Without Supabase credentials the app runs fully in the browser with sample data. */
  demo: !url || !anonKey,
  enableGoogle: String(import.meta.env.VITE_ENABLE_GOOGLE ?? '').toLowerCase() === 'true',
  appName: 'Family Game Exchange',
};

/** Absolute URL of the app (works on GitHub Pages sub-paths). */
export function appBaseUrl(): string {
  return window.location.origin + window.location.pathname.replace(/index\.html$/, '');
}
