import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Family, Invite, Profile, Role } from '../types';
import { useAuth } from './auth';

interface FamiliesState {
  /** Your own profile (users/{uid}). */
  me: Profile | undefined;
  families: Family[];
  /** Pending invites addressed to your email. */
  invites: Invite[];
  current: Family | null;
  role: Role | null;
  isAdmin: boolean;
  loading: boolean;
  switchFamily: (id: string) => void;
}

const FamiliesContext = createContext<FamiliesState | null>(null);
const storeKey = (uid: string) => `fge-family:${uid}`;

/** ?family=<id> in the (hash) URL — used by email links. */
function familyFromUrl(): string | null {
  const q = window.location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get('family') : null;
}

export function FamiliesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.userId ?? '';
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ['me', uid], queryFn: api.getMe, enabled: !!uid });
  // Families and invites don't need the profile, so they load alongside it.
  const families = useQuery({ queryKey: ['families', uid], queryFn: api.listMyFamilies, enabled: !!uid });
  const invites = useQuery({ queryKey: ['my_invites', uid], queryFn: api.listMyInvites, enabled: !!uid });

  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return familyFromUrl() ?? (uid ? localStorage.getItem(storeKey(uid)) : null);
    } catch {
      return familyFromUrl();
    }
  });

  // Follow ?family= links while the app is open.
  useEffect(() => {
    const onHash = () => {
      const f = familyFromUrl();
      if (f) setSelected(f);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const list = useMemo(() => families.data ?? [], [families.data]);
  const current = list.find((f) => f.id === selected) ?? list[0] ?? null;

  // Point the API at the chosen family before any family query runs.
  api.selectFamily(current?.id ?? null);

  useEffect(() => {
    if (!uid || !current) return;
    try {
      localStorage.setItem(storeKey(uid), current.id);
    } catch {
      /* ignore */
    }
  }, [uid, current]);

  const switchFamily = useCallback(
    (id: string) => {
      setSelected(id);
      // Drop the previous family's cached data so nothing leaks across.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] === 'fam' && q.queryKey[1] !== id });
    },
    [qc],
  );

  const role: Role | null = current
    ? current.owner_id === uid ? 'owner' : current.admin_ids.includes(uid) ? 'admin' : 'member'
    : null;

  const value = useMemo<FamiliesState>(
    () => ({
      me: me.data,
      families: list,
      invites: invites.data ?? [],
      current,
      role,
      isAdmin: role === 'owner' || role === 'admin',
      loading: me.isLoading || families.isLoading,
      switchFamily,
    }),
    [me.data, list, invites.data, current, role, me.isLoading, families.isLoading, switchFamily],
  );
  return <FamiliesContext.Provider value={value}>{children}</FamiliesContext.Provider>;
}

export function useFamilies() {
  const ctx = useContext(FamiliesContext);
  if (!ctx) throw new Error('useFamilies outside provider');
  return ctx;
}
