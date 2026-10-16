import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Table } from '../api';
import { buildEntries } from '../lib/library';
import type { Profile } from '../types';
import { useAuth } from './auth';
import { useToast } from './toast';

export const qk = {
  profiles: ['profiles'] as const,
  games: ['games'] as const,
  library: ['library'] as const,
  loans: ['loans'] as const,
  events: (loanId: string) => ['events', loanId] as const,
  notifications: ['notifications'] as const,
  invites: ['invites'] as const,
};

const tableKeys: Record<Table, readonly (readonly string[])[]> = {
  profiles: [qk.profiles],
  games: [qk.games],
  library_items: [qk.library, qk.games],
  loans: [qk.loans],
  loan_events: [['events']],
  notifications: [qk.notifications],
  invites: [qk.invites],
};

/** Keep every open browser in sync with database changes. */
export function useLiveUpdates(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return api.subscribe((table) => {
      for (const key of tableKeys[table]) void qc.invalidateQueries({ queryKey: key });
    });
  }, [enabled, qc]);
}

export const useProfiles = () => useQuery({ queryKey: qk.profiles, queryFn: api.listProfiles });
export const useGames = () => useQuery({ queryKey: qk.games, queryFn: api.listGames });
export const useLibrary = () => useQuery({ queryKey: qk.library, queryFn: api.listLibrary });
export const useLoans = () => useQuery({ queryKey: qk.loans, queryFn: api.listLoans });
export const useInvites = () => useQuery({ queryKey: qk.invites, queryFn: api.listInvites });
export const useNotifications = () =>
  useQuery({ queryKey: qk.notifications, queryFn: api.listNotifications, refetchInterval: 60_000 });
export const useLoanEvents = (loanId: string) =>
  useQuery({ queryKey: qk.events(loanId), queryFn: () => api.listLoanEvents(loanId) });

/** Everything about the family's shared library, joined and indexed. */
export function useFamily() {
  const { session } = useAuth();
  const meId = session?.userId ?? '';
  const profiles = useProfiles();
  const games = useGames();
  const library = useLibrary();
  const loans = useLoans();
  const invites = useInvites();

  return useMemo(() => {
    const profileList = profiles.data ?? [];
    const profileById = new Map(profileList.map((p) => [p.id, p]));
    const inviteEmails = new Set((invites.data ?? []).map((i) => i.email));
    const members: Profile[] = profileList.filter((p) => inviteEmails.has(p.email));
    const gameList = games.data ?? [];
    const items = library.data ?? [];
    const loanList = loans.data ?? [];
    const entries = buildEntries(gameList, items, loanList, profileById, meId);
    return {
      meId,
      me: profileById.get(meId),
      profiles: profileList,
      profileById,
      members,
      invites: invites.data ?? [],
      games: gameList,
      gameById: new Map(gameList.map((g) => [g.id, g])),
      items,
      itemById: new Map(items.map((i) => [i.id, i])),
      loans: loanList,
      entries,
      entryByGame: new Map(entries.map((e) => [e.game.id, e])),
      loading: profiles.isLoading || games.isLoading || library.isLoading || loans.isLoading || invites.isLoading,
      error: profiles.error || games.error || library.error || loans.error || invites.error,
    };
  }, [meId, profiles.data, games.data, library.data, loans.data, invites.data, profiles.isLoading, games.isLoading,
    library.isLoading, loans.isLoading, invites.isLoading, profiles.error, games.error, library.error, loans.error, invites.error]);
}

export type Family = ReturnType<typeof useFamily>;

/**
 * Run a backend action with consistent UX: busy state, refetch, queued emails,
 * a success toast and friendly error toasts. Never throws.
 */
export function useAction() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, opts: { success?: string; emails?: boolean } = {}): Promise<{ ok: boolean; value?: T }> => {
      setBusy(true);
      try {
        const result = await fn();
        await qc.invalidateQueries();
        if (opts.emails) void api.flushEmails();
        if (opts.success) toast.success(opts.success);
        return { ok: true, value: result };
      } catch (err) {
        toast.error(err);
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [qc, toast],
  );

  return { run, busy };
}
