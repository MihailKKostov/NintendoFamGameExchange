import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Session } from '../types';

type Status = 'loading' | 'signed_out' | 'ready';

interface AuthState {
  status: Status;
  session: Session | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const lastUser = useRef<string | null>(null);

  const apply = useCallback(
    (s: Session | null) => {
      // Never show one person's cached data to another.
      if ((s?.userId ?? null) !== lastUser.current) {
        if (lastUser.current) qc.clear();
        lastUser.current = s?.userId ?? null;
      }
      setSession(s);
      setStatus(s ? 'ready' : 'signed_out');
    },
    [qc],
  );

  useEffect(() => {
    let alive = true;
    void api.getSession().then((s) => {
      if (alive) apply(s);
    });
    const off = api.onAuthChange((s) => {
      if (alive) apply(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, [apply]);

  const signOut = useCallback(async () => {
    await api.signOut();
    qc.clear();
    apply(null);
  }, [qc, apply]);

  const value = useMemo(() => ({ status, session, signOut }), [status, session, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
