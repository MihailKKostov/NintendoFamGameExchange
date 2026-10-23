import { useEffect } from 'react';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';

/*
 * A copy of what you last saw (your profile, families and the current family's
 * library), kept on this device so the app can show it the moment it opens.
 * Live data from Firebase replaces it as soon as your sign-in is confirmed.
 * It's removed when you sign out.
 */

const PREFIX = 'fge-snapshot:';
const VERSION = 1;
const FAMILY_TABLES = new Set(['members', 'games', 'library_items', 'loans', 'ratings']);

interface Saved {
  v: number;
  at: number;
  queries: [QueryKey, unknown][];
}

export function restoreSnapshot(qc: QueryClient, uid: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFIX + uid) ?? 'null') as Saved | null;
    if (!saved || saved.v !== VERSION) return;
    for (const [key, data] of saved.queries) {
      qc.setQueryData(key, data, { updatedAt: saved.at });
      // Outdated by definition: refresh from Firebase (and listen live) as soon as it's shown.
      void qc.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
    }
  } catch {
    /* unreadable or blocked storage: start normally */
  }
}

export function clearSnapshots() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** Keep the snapshot up to date while the app is open. */
export function useSnapshotSaver(uid: string, familyId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!uid) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      const queries: [QueryKey, unknown][] = [];
      for (const q of qc.getQueryCache().getAll()) {
        const k = q.queryKey;
        if (q.state.status !== 'success' || q.state.data === undefined) continue;
        const mine = ['me', 'families', 'my_invites', 'notifications'].includes(k[0] as string) && k[1] === uid;
        const family = k[0] === 'fam' && k[1] === familyId && FAMILY_TABLES.has(k[2] as string);
        if (mine || family) queries.push([k, q.state.data]);
      }
      try {
        localStorage.setItem(PREFIX + uid, JSON.stringify({ v: VERSION, at: Date.now(), queries } satisfies Saved));
      } catch {
        /* full or blocked storage: skip */
      }
    };
    const off = qc.getQueryCache().subscribe((e) => {
      if (e.type !== 'updated') return;
      clearTimeout(timer);
      timer = setTimeout(save, 1000);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [qc, uid, familyId]);
}
