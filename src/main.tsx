import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { config } from './config';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';

const root = createRoot(document.getElementById('root')!);

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
