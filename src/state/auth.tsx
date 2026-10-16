import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Session } from '../types';

type Status = 'loading' | 'signed_out' | 'no_access' | 'ready';

interface AuthState {
  status: Status;
  session: Session | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [isAdmin, setIsAdmin] = useState(false);
  const lastUser = useRef<string | null>(null);

  const evaluate = useCallback(async (s: Session | null) => {
    // Never show one person's cached data to another.
    if ((s?.userId ?? null) !== lastUser.current) {
      if (lastUser.current) qc.clear();
      lastUser.current = s?.userId ?? null;
    }
    setSession(s);
    if (!s) {
      setStatus('signed_out');
      setIsAdmin(false);
      return;
    }
    try {
      const m = await api.getMembership();
      setIsAdmin(m.admin);
      setStatus(m.member ? 'ready' : 'no_access');
    } catch {
      setStatus('no_access');
    }
  }, [qc]);

  useEffect(() => {
    let alive = true;
    void api.getSession().then((s) => {
      if (alive) void evaluate(s);
    });
    const off = api.onAuthChange((s) => {
      if (!alive) return;
      // Sign-in links come back as ?code=...; tidy the address bar.
      if (s && /[?&](code|error_description)=/.test(window.location.search)) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
      void evaluate(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, [evaluate]);

  const signOut = useCallback(async () => {
    await api.signOut();
    qc.clear();
    await evaluate(null);
  }, [qc, evaluate]);

  const refresh = useCallback(async () => evaluate(await api.getSession()), [evaluate]);

  const value = useMemo(() => ({ status, session, isAdmin, signOut, refresh }), [status, session, isAdmin, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
