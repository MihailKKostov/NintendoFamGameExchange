import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { config } from './config';
import '@fontsource-variable/nunito';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';

const root = createRoot(document.getElementById('root')!);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Keeps the app's files on the device so it reopens quickly (see public/sw.js).
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  });
}

// A file from an older release can be gone after a new one is published:
// reload (at most every 10 seconds) to pick up the new release.
window.addEventListener('vite:preloadError', (e) => {
  try {
    const last = Number(sessionStorage.getItem('fge-reloaded-at') ?? 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem('fge-reloaded-at', String(Date.now()));
  } catch {
    return;
  }
  e.preventDefault();
  window.location.reload();
});

// Without a usable Firebase config a published build shows setup help — it
// never falls back to sample data. (The app module isn't even loaded.)
if (config.missing) {
  void import('./pages/SetupNeeded').then(({ SetupNeeded }) => root.render(<SetupNeeded />));
} else {
  void import('./App').then(({ App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
}
