import type { Game, GameRating, LibraryItem, Loan, Profile } from '../types';
import { yearOf } from './format';

export interface CopyInfo {
  item: LibraryItem;
  owner: Profile | undefined;
  active: Loan | undefined;
  pending: Loan[];
  /** The signed-in user's open request for this copy, if any. */
  myRequest: Loan | undefined;
}

export type CopyState = 'mine' | 'mine_lent' | 'borrowed' | 'requested' | 'available' | 'on_loan' | 'unavailable';

export function copyState(copy: CopyInfo, meId: string): CopyState {
  if (copy.item.owner_id === meId) return copy.active ? 'mine_lent' : 'mine';
  if (copy.active?.borrower_id === meId) return 'borrowed';
  if (copy.myRequest) return 'requested';
  if (!copy.item.lendable) return 'unavailable';
  if (copy.active) return 'on_loan';
  return 'available';
}

export interface GameEntry {
  game: Game;
  copies: CopyInfo[];
  owners: Profile[];
  /** Copies someone else could borrow right now. */
  availableCount: number;
  onLoanCount: number;
  pendingCount: number;
  latestAdded: string;
  /** Average stars from current family members (null when nobody rated it). */
  rating: number | null;
  ratingCount: number;
  myRating: number | null;
  /** Ids of current members who recommend it. */
  recommendedBy: string[];
  /** Current members' ratings and recommendations. */
  opinions: GameRating[];
}

export interface RatingSummary {
  rating: number | null;
  ratingCount: number;
  myRating: number | null;
  recommendedBy: string[];
  opinions: GameRating[];
}

const noRatings: RatingSummary = { rating: null, ratingCount: 0, myRating: null, recommendedBy: [], opinions: [] };

/** Per game: the family's average rating and recommendations (current members only). */
export function summarizeRatings(ratings: GameRating[], memberIds: Set<string>, meId: string): Map<string, RatingSummary> {
  const out = new Map<string, RatingSummary>();
  for (const r of ratings) {
    if (!memberIds.has(r.user_id)) continue;
    let s = out.get(r.game_id);
    if (!s) out.set(r.game_id, (s = { ...noRatings, recommendedBy: [], opinions: [] }));
    s.opinions.push(r);
    if (r.rating != null) {
      s.rating = ((s.rating ?? 0) * s.ratingCount + r.rating) / (s.ratingCount + 1);
      s.ratingCount++;
      if (r.user_id === meId) s.myRating = r.rating;
    }
    if (r.recommended) s.recommendedBy.push(r.user_id);
  }
  return out;
}

export const ratingSummaryFor = (map: Map<string, RatingSummary>, gameId: string) => map.get(gameId) ?? noRatings;

export function buildEntries(
  games: Game[],
  items: LibraryItem[],
  loans: Loan[],
  profileById: Map<string, Profile>,
  meId: string,
  ratings: Map<string, RatingSummary> = new Map(),
): GameEntry[] {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const loansByItem = new Map<string, Loan[]>();
  for (const l of loans) {
    if (!l.item_id) continue;
    const arr = loansByItem.get(l.item_id) ?? [];
    arr.push(l);
    loansByItem.set(l.item_id, arr);
  }

  const byGame = new Map<string, GameEntry>();
  for (const item of items) {
    const game = gameById.get(item.game_id);
    if (!game) continue;
    const itemLoans = loansByItem.get(item.id) ?? [];
    const copy: CopyInfo = {
      item,
      owner: profileById.get(item.owner_id),
      active: itemLoans.find((l) => l.status === 'active'),
      pending: itemLoans.filter((l) => l.status === 'pending'),
      myRequest: itemLoans.find((l) => l.status === 'pending' && l.borrower_id === meId),
    };
    let entry = byGame.get(game.id);
    if (!entry) {
      entry = {
        game, copies: [], owners: [], availableCount: 0, onLoanCount: 0, pendingCount: 0, latestAdded: item.created_at,
        ...ratingSummaryFor(ratings, game.id),
      };
      byGame.set(game.id, entry);
    }
    entry.copies.push(copy);
    if (copy.owner && !entry.owners.some((o) => o.id === copy.owner!.id)) entry.owners.push(copy.owner);
    if (item.owner_id !== meId && item.lendable && !copy.active) entry.availableCount++;
    if (copy.active) entry.onLoanCount++;
    entry.pendingCount += copy.pending.length;
    if (item.created_at > entry.latestAdded) entry.latestAdded = item.created_at;
  }
  return [...byGame.values()];
}

/**
 * A member's favourite games (in their chosen order), limited to games they
 * still own in this family. Empty when they haven't picked any.
 */
export function favoriteGames(
  member: { id: string; favorite_game_ids?: string[] } | undefined,
  items: LibraryItem[],
  gameById: Map<string, Game>,
): Game[] {
  if (!member?.favorite_game_ids?.length) return [];
  const owned = new Set(items.filter((i) => i.owner_id === member.id).map((i) => i.game_id));
  return member.favorite_game_ids
    .filter((id) => owned.has(id))
    .map((id) => gameById.get(id))
    .filter((g): g is Game => !!g)
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface Filters {
  q: string;
  genres: string[];
  platform: string;
  publisher: string;
  developer: string;
  year: string;
  players: '' | 'solo' | '2' | '4';
  multiplayer: boolean;
  local: boolean;
  online: boolean;
  coop: boolean;
  /** Hide games you already own a copy of. */
  notMine: boolean;
  owner: string;
  availability: '' | 'available' | 'on_loan';
  format: '' | 'physical' | 'digital';
  /** Minimum family rating, or only games nobody has rated yet. */
  rating: '' | '3' | '4' | '4.5' | 'unrated';
  /** Only games someone in the family recommends. */
  recommended: boolean;
  sort: SortKey;
}

export const SORTS = ['recent', 'rating', 'title', 'release_new', 'release_old', 'popular'] as const;
export type SortKey = (typeof SORTS)[number];
export const sortLabels: Record<SortKey, string> = {
  recent: 'Recently added',
  rating: 'Highest rated',
  title: 'Name A–Z',
  release_new: 'Newest releases',
  release_old: 'Oldest releases',
  popular: 'Most copies',
};

export const emptyFilters: Filters = {
  q: '', genres: [], platform: '', publisher: '', developer: '', year: '', players: '',
  multiplayer: false, local: false, online: false, coop: false, notMine: false, owner: '', availability: '', format: '',
  rating: '', recommended: false, sort: 'recent',
};

export function filtersFromParams(p: URLSearchParams): Filters {
  const pick = <T extends string>(k: string, allowed: readonly T[], d: T): T => {
    const v = p.get(k) as T | null;
    return v && allowed.includes(v) ? v : d;
  };
  return {
    q: p.get('q') ?? '',
    genres: p.getAll('genre'),
    platform: p.get('platform') ?? '',
    publisher: p.get('publisher') ?? '',
    developer: p.get('developer') ?? '',
    year: p.get('year') ?? '',
    players: pick('players', ['', 'solo', '2', '4'] as const, ''),
    multiplayer: p.has('multiplayer'),
    local: p.has('local'),
    online: p.has('online'),
    coop: p.has('coop'),
    notMine: p.has('notmine'),
    owner: p.get('owner') ?? '',
    availability: pick('availability', ['', 'available', 'on_loan'] as const, ''),
    format: pick('format', ['', 'physical', 'digital'] as const, ''),
    rating: pick('rating', ['', '3', '4', '4.5', 'unrated'] as const, ''),
    recommended: p.has('rec'),
    sort: pick('sort', SORTS, 'recent'),
  };
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  f.genres.forEach((g) => p.append('genre', g));
  for (const k of ['platform', 'publisher', 'developer', 'year', 'players', 'owner', 'availability', 'format', 'rating'] as const) {
    if (f[k]) p.set(k, f[k]);
  }
  for (const k of ['multiplayer', 'local', 'online', 'coop'] as const) if (f[k]) p.set(k, '1');
  if (f.notMine) p.set('notmine', '1');
  if (f.recommended) p.set('rec', '1');
  if (f.sort !== 'recent') p.set('sort', f.sort);
  return p;
}

export function activeFilterCount(f: Filters): number {
  let n = f.genres.length;
  for (const k of ['platform', 'publisher', 'developer', 'year', 'players', 'owner', 'availability', 'format', 'rating'] as const) if (f[k]) n++;
  for (const k of ['multiplayer', 'local', 'online', 'coop', 'notMine', 'recommended'] as const) if (f[k]) n++;
  return n;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function applyFilters(entries: GameEntry[], f: Filters, meId = ''): GameEntry[] {
  const words = norm(f.q).split(/\s+/).filter(Boolean);
  const out = entries.filter(({ game: g, copies, owners, rating, recommendedBy }) => {
    if (words.length) {
      const hay = norm([g.title, g.publisher, g.developer, ...g.genres, ...owners.map((o) => `${o.display_name} ${o.nickname ?? ''}`)].join(' '));
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (f.genres.length && !f.genres.every((x) => g.genres.includes(x))) return false;
    if (f.platform && g.platform !== f.platform) return false;
    if (f.publisher && g.publisher !== f.publisher) return false;
    if (f.developer && g.developer !== f.developer) return false;
    if (f.year && String(yearOf(g.release_date)) !== f.year) return false;
    if (f.players === 'solo' && g.multiplayer) return false;
    if (f.players === '2' && !((g.max_players ?? 1) >= 2 || g.multiplayer)) return false;
    if (f.players === '4' && (g.max_players ?? 1) < 4) return false;
    if (f.multiplayer && !g.multiplayer) return false;
    if (f.local && !g.local_multiplayer) return false;
    if (f.online && !g.online_multiplayer) return false;
    if (f.coop && !g.coop) return false;
    if (f.owner && !copies.some((c) => c.item.owner_id === f.owner)) return false;
    if (f.notMine && meId && copies.some((c) => c.item.owner_id === meId)) return false;
    if (f.format && !copies.some((c) => c.item.format === f.format)) return false;
    if (f.availability === 'available' && !copies.some((c) => c.item.lendable && !c.active)) return false;
    if (f.availability === 'on_loan' && !copies.some((c) => c.active)) return false;
    if (f.rating === 'unrated' && rating != null) return false;
    if (f.rating && f.rating !== 'unrated' && (rating == null || rating < Number(f.rating))) return false;
    if (f.recommended && !recommendedBy.length) return false;
    return true;
  });

  const byTitle = (a: GameEntry, b: GameEntry) => a.game.title.localeCompare(b.game.title);
  const rel = (e: GameEntry) => e.game.release_date ?? '';
  switch (f.sort) {
    case 'title':
      return out.sort(byTitle);
    case 'release_new':
      return out.sort((a, b) => rel(b).localeCompare(rel(a)) || byTitle(a, b));
    case 'release_old':
      return out.sort((a, b) => (rel(a) || '9999').localeCompare(rel(b) || '9999') || byTitle(a, b));
    case 'rating':
      // Best rated first (more ratings wins a tie); games nobody rated go last.
      return out.sort(
        (a, b) =>
          (b.rating ?? -1) - (a.rating ?? -1) || b.ratingCount - a.ratingCount || b.recommendedBy.length - a.recommendedBy.length || byTitle(a, b),
      );
    case 'popular':
      return out.sort((a, b) => b.copies.length - a.copies.length || byTitle(a, b));
    default:
      return out.sort((a, b) => b.latestAdded.localeCompare(a.latestAdded));
  }
}

export interface FacetOptions {
  genres: string[];
  platforms: string[];
  publishers: string[];
  developers: string[];
  years: string[];
}

export function facetOptions(entries: GameEntry[]): FacetOptions {
  const sets = { genres: new Set<string>(), platforms: new Set<string>(), publishers: new Set<string>(), developers: new Set<string>(), years: new Set<string>() };
  for (const { game: g } of entries) {
    g.genres.forEach((x) => sets.genres.add(x));
    if (g.platform) sets.platforms.add(g.platform);
    if (g.publisher) sets.publishers.add(g.publisher);
    if (g.developer) sets.developers.add(g.developer);
    const y = yearOf(g.release_date);
    if (y) sets.years.add(String(y));
  }
  const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return {
    genres: sorted(sets.genres),
    platforms: sorted(sets.platforms),
    publishers: sorted(sets.publishers),
    developers: sorted(sets.developers),
    years: [...sets.years].sort((a, b) => Number(b) - Number(a)),
  };
}
