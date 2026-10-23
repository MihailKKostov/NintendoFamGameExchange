import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Table } from '../api';
import { buildEntries, summarizeRatings } from '../lib/library';
import { useAuth } from './auth';
import { useFamilies } from './families';
import { useToast } from './toast';

/** Family-scoped query keys start with ['fam', familyId, …]. */
export const qk = {
  members: (fid: string) => ['fam', fid, 'members'] as const,
  games: (fid: string) => ['fam', fid, 'games'] as const,
  library: (fid: string) => ['fam', fid, 'library_items'] as const,
  loans: (fid: string) => ['fam', fid, 'loans'] as const,
  events: (fid: string, loanId: string) => ['fam', fid, 'loan_events', loanId] as const,
  familyInvites: (fid: string) => ['fam', fid, 'family_invites'] as const,
  ratings: (fid: string) => ['fam', fid, 'ratings'] as const,
  notifications: (uid: string) => ['notifications', uid] as const,
};

/** Keep every open browser in sync with database changes. */
export function useLiveUpdates(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return api.subscribe((table: Table) => {
      void qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === table ||
          (q.queryKey[0] === 'fam' && (q.queryKey[2] === table || (table === 'library_items' && q.queryKey[2] === 'games'))),
      });
    });
  }, [enabled, qc]);
}

const useFid = () => useFamilies().current?.id ?? '';

export const useMembers = () => {
  const fid = useFid();
  return useQuery({ queryKey: qk.members(fid), queryFn: api.listMembers, enabled: !!fid });
};
export const useGames = () => {
  const fid = useFid();
  return useQuery({ queryKey: qk.games(fid), queryFn: api.listGames, enabled: !!fid });
};
export const useLibrary = () => {
  const fid = useFid();
  return useQuery({ queryKey: qk.library(fid), queryFn: api.listLibrary, enabled: !!fid });
};
export const useLoans = () => {
  const fid = useFid();
  return useQuery({ queryKey: qk.loans(fid), queryFn: api.listLoans, enabled: !!fid });
};
export const useRatings = () => {
  const fid = useFid();
  return useQuery({ queryKey: qk.ratings(fid), queryFn: api.listRatings, enabled: !!fid });
};
export const useLoanEvents = (loanId: string) => {
  const fid = useFid();
  return useQuery({ queryKey: qk.events(fid, loanId), queryFn: () => api.listLoanEvents(loanId), enabled: !!fid });
};
export const useFamilyInvites = (enabled = true) => {
  const fid = useFid();
  return useQuery({ queryKey: qk.familyInvites(fid), queryFn: api.listFamilyInvites, enabled: !!fid && enabled });
};
export const useNotifications = () => {
  const { session } = useAuth();
  const uid = session?.userId ?? '';
  return useQuery({ queryKey: qk.notifications(uid), queryFn: api.listNotifications, enabled: !!uid });
};

/** Everything about the current family's shared library, joined and indexed. */
export function useFamily() {
  const { session } = useAuth();
  const { me: myProfile } = useFamilies();
  const meId = session?.userId ?? '';
  const members = useMembers();
  const games = useGames();
  const library = useLibrary();
  const loans = useLoans();
  const ratings = useRatings();

  return useMemo(() => {
    const all = members.data ?? [];
    const profileById = new Map(all.map((p) => [p.id, p]));
    const active = all.filter((m) => m.status === 'active');
    const gameList = games.data ?? [];
    const items = library.data ?? [];
    const loanList = loans.data ?? [];
    const ratingByGame = summarizeRatings(ratings.data ?? [], new Set(active.map((m) => m.id)), meId);
    const entries = buildEntries(gameList, items, loanList, profileById, meId, ratingByGame);
    const meMember = profileById.get(meId);
    return {
      meId,
      /** Your profile (with your role in this family when available). */
      me: meMember ?? myProfile,
      profiles: all,
      profileById,
      members: active,
      games: gameList,
      gameById: new Map(gameList.map((g) => [g.id, g])),
      items,
      itemById: new Map(items.map((i) => [i.id, i])),
      loans: loanList,
      entries,
      entryByGame: new Map(entries.map((e) => [e.game.id, e])),
      /** Ratings for any game in the family (also ones nobody owns right now). */
      ratingByGame,
      // Ratings aren't part of loading/error: the library works without them.
      loading: members.isLoading || games.isLoading || library.isLoading || loans.isLoading,
      error: members.error || games.error || library.error || loans.error,
    };
  }, [meId, myProfile, members.data, games.data, library.data, loans.data, ratings.data, members.isLoading, games.isLoading,
    library.isLoading, loans.isLoading, members.error, games.error, library.error, loans.error]);
}

export type Family = ReturnType<typeof useFamily>;

/**
 * Run a backend action with consistent UX: busy state, refetch, a success
 * toast and friendly error toasts. Never throws.
 */
export function useAction() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, opts: { success?: string } = {}): Promise<{ ok: boolean; value?: T }> => {
      setBusy(true);
      try {
        const result = await fn();
        await qc.invalidateQueries();
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
