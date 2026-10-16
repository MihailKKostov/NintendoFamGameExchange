import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { play } from './lib/sounds';
import { Browse } from './pages/Browse';
import { GamePage } from './pages/GamePage';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { LoanPage } from './pages/LoanPage';
import { Loans } from './pages/Loans';
import { Login } from './pages/Login';
import { MemberPage } from './pages/MemberPage';
import { Members } from './pages/Members';
import { NotFound } from './pages/Misc';
import { FamilySettings } from './pages/FamilySettings';
import { JoinPage, Onboarding } from './pages/Onboarding';
import { Settings } from './pages/Settings';
import { AuthProvider, useAuth } from './state/auth';
import { useLiveUpdates } from './state/data';
import { FamiliesProvider, useFamilies } from './state/families';
import { SettingsProvider } from './state/settings';
import { ToastProvider } from './state/toast';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
});

/** Console-style feedback: a soft tick when hovering selectable things, a click on press. */
function useUiSounds() {
  useEffect(() => {
    let last: Element | null = null;
    const over = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.('.selectable, .dock-btn, .hero-tile, .chip');
      if (el && el !== last) play('tick');
      last = el;
    };
    const down = (e: PointerEvent) => {
      const el = (e.target as Element).closest?.('a, button');
      if (el && !(el as HTMLButtonElement).disabled && !el.closest('.modal-close, .search-ac, .toggle')) play('select');
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('pointerdown', down);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('pointerdown', down);
    };
  }, []);
}

function FamilyGate() {
  const { loading, current } = useFamilies();
  useLiveUpdates(true);

  useEffect(() => {
    // Coming back from a sign-in link or Google: return to the page that asked for it.
    try {
      const back = localStorage.getItem('fge-return-to');
      localStorage.removeItem('fge-return-to');
      if (back && back.startsWith('#/') && ['', '#', '#/'].includes(window.location.hash)) window.location.hash = back;
    } catch {
      /* storage blocked */
    }
  }, []);

  if (loading) return <PageLoader text="Loading your families…" />;

  return (
    <Routes>
      <Route path="join/:inviteId" element={<JoinPage />} />
      <Route path="families/new" element={<Onboarding />} />
      {current ? (
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="browse" element={<Browse />} />
          <Route path="games/:gameId" element={<GamePage />} />
          <Route path="library" element={<Library />} />
          <Route path="loans" element={<Loans />} />
          <Route path="loans/:loanId" element={<LoanPage />} />
          <Route path="members" element={<Members />} />
          <Route path="members/:memberId" element={<MemberPage />} />
          <Route path="family" element={<FamilySettings />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      ) : (
        <Route path="*" element={<Onboarding />} />
      )}
    </Routes>
  );
}

function Gate() {
  const { status, session } = useAuth();
  if (status === 'loading') return <PageLoader text="Starting up…" />;
  if (status === 'signed_out' || !session) return <Login />;
  return (
    <FamiliesProvider key={session.userId}>
      <FamilyGate />
    </FamiliesProvider>
  );
}

export function App() {
  useUiSounds();
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <ToastProvider>
          <AuthProvider>
            <HashRouter>
              <Gate />
            </HashRouter>
          </AuthProvider>
        </ToastProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}
