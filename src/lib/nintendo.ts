import type { GameInput } from '../types';

/*
 * Nintendo eShop catalog search.
 *
 * nintendo.com's own store search runs on a public, search-only Algolia index.
 * We query it straight from the browser (it allows CORS) to autocomplete game
 * names and pull the official eShop icon, publisher, genres, players, etc.
 */

const ALGOLIA_APP = 'U3B6GR4UA3';
const ALGOLIA_KEY = 'a29c6927638bfd8cee23993e51e721c9';
const INDEX = 'store_game_en_us';
// Credentials go in the query string and the body is sent as form-encoded text so
// the browser treats it as a "simple" CORS request (no preflight round trip).
const ENDPOINT =
  `https://${ALGOLIA_APP.toLowerCase()}-dsn.algolia.net/1/indexes/${INDEX}/query` +
  `?x-algolia-application-id=${ALGOLIA_APP}&x-algolia-api-key=${ALGOLIA_KEY}`;

const ATTRIBUTES = [
  'nsuid', 'objectID', 'title', 'productImageSquare', 'productImage', 'platform', 'softwarePublisher',
  'softwareDeveloper', 'releaseDate', 'gameGenreLabels', 'playerCount', 'playModes', 'gameFeatureLabels',
  'waysToPlay', 'waysToPlayLabels', 'nsoFeatures', 'contentRating', 'description', 'url', 'popularityRank',
  'dlcType', 'eshopDetails',
];

export interface CatalogHit {
  nsuid?: string;
  objectID: string;
  title: string;
  productImageSquare?: string;
  productImage?: string;
  platform?: string;
  softwarePublisher?: string;
  softwareDeveloper?: string;
  releaseDate?: string;
  gameGenreLabels?: string[];
  playerCount?: string;
  playModes?: string[];
  gameFeatureLabels?: string[];
  waysToPlay?: { code: string; label: string }[];
  waysToPlayLabels?: string[];
  nsoFeatures?: string[];
  contentRating?: { label?: string } | null;
  description?: string | null;
  url?: string;
  popularityRank?: number | null;
  dlcType?: string | null;
  eshopDetails?: { productType?: string } | null;
}

export const cleanTitle = (title: string) =>
  title.replace(/[™®©]/g, '').replace(/\s+/g, ' ').replace(/\s+:/g, ':').trim();

const normalize = (s: string) =>
  cleanTitle(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Re-rank Algolia hits: exact/prefix title matches and popular titles first. */
function rank(hits: CatalogHit[], query: string): CatalogHit[] {
  const q = normalize(query);
  const words = q.split(' ').filter(Boolean);
  const score = (h: CatalogHit) => {
    const t = normalize(h.title);
    let s = 0;
    if (t === q) s += 1000;
    else if (t.startsWith(q)) s += 400;
    else if (words.every((w) => t.includes(w))) s += 200;
    if (h.popularityRank != null) s += Math.max(0, 300 - Math.log2(h.popularityRank + 1) * 25);
    if (h.dlcType || h.eshopDetails?.productType === 'BUNDLE') s -= 250;
    if (/\b(demo|trial|soundtrack|upgrade pack)\b/i.test(h.title)) s -= 300;
    return s;
  };
  return hits
    .map((h, i) => ({ h, s: score(h) - i * 0.5 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.h);
}

async function algolia(query: string, hitsPerPage: number, signal?: AbortSignal): Promise<CatalogHit[]> {
  const params = new URLSearchParams({
    query,
    hitsPerPage: String(hitsPerPage),
    filters: 'topLevelCategoryCode:GAMES AND NOT editions:DLC AND NOT dlcType:Individual',
    attributesToRetrieve: JSON.stringify(ATTRIBUTES),
    attributesToHighlight: '[]',
  });
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: JSON.stringify({ params: params.toString() }),
  });
  if (!res.ok) throw new Error(`Nintendo catalog search failed (${res.status})`);
  const data = await res.json();
  return (data.hits ?? []) as CatalogHit[];
}

export async function searchCatalog(query: string, limit = 8, signal?: AbortSignal): Promise<CatalogHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const hits = await algolia(q, 40, signal);
  return rank(hits, q).slice(0, limit);
}

/** Best catalog match for a title detected in a screenshot (plus runners-up). */
export async function matchTitle(title: string, platform?: string | null): Promise<CatalogHit[]> {
  let hits = await algolia(title, 30);
  if (!hits.length) {
    // Fall back to the first few words — OCR'd titles can carry extra words.
    const shorter = title.split(/\s+/).slice(0, 3).join(' ');
    if (shorter !== title) hits = await algolia(shorter, 30);
  }
  let ranked = rank(hits, title);
  if (platform) {
    const p = platform.toLowerCase();
    ranked = [...ranked.filter((h) => h.platform?.toLowerCase() === p), ...ranked.filter((h) => h.platform?.toLowerCase() !== p)];
  }
  return ranked.slice(0, 5);
}

const PLAY_MODES = new Set(['TV mode', 'Tabletop mode', 'Handheld mode']);
const LOCAL_CODES = new Set(['SHARING', 'LOCAL_CONNECTION', 'FRIENDS_FAMILY', 'GAMESHARE_LOCAL']);
const ONLINE_CODES = new Set(['ONLINE_BATTLE', 'FRIEND_MATCHING', 'ONLINE_COOP', 'CROSS_PLATFORM', 'GAMESHARE_GAMECHAT']);

export function maxPlayersFromLabel(label?: string | null): number | null {
  if (!label) return null;
  if (/single/i.test(label)) return 1;
  const nums = label.match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : null;
}

export function iconFromHit(hit: CatalogHit): string | null {
  if (hit.productImageSquare) return hit.productImageSquare;
  if (hit.productImage) return `https://assets.nintendo.com/image/upload/c_fill,w_512,h_512/f_auto/q_auto/${hit.productImage}`;
  return null;
}

export function hitToGame(hit: CatalogHit): GameInput {
  const ways = hit.waysToPlay ?? [];
  const wayLabels = hit.waysToPlayLabels ?? ways.map((w) => w.label);
  const codes = new Set(ways.map((w) => w.code));
  const maxPlayers = maxPlayersFromLabel(hit.playerCount);
  const local = ways.some((w) => LOCAL_CODES.has(w.code)) || wayLabels.some((l) => /one console|meet up|local/i.test(l));
  const online =
    ways.some((w) => ONLINE_CODES.has(w.code)) ||
    wayLabels.some((l) => /online/i.test(l)) ||
    (hit.nsoFeatures ?? []).includes('Online Play');
  const coop = codes.has('ONLINE_COOP') || wayLabels.some((l) => /co-?op/i.test(l)) ||
    (hit.gameFeatureLabels ?? []).some((l) => /co-?op/i.test(l));
  const multiplayer = (maxPlayers ?? 1) > 1 || local || online;

  return {
    nsuid: hit.nsuid ?? hit.objectID,
    title: cleanTitle(hit.title),
    icon_url: iconFromHit(hit),
    hero_url: hit.productImage
      ? `https://assets.nintendo.com/image/upload/c_fill,w_1240,h_698/f_auto/q_auto/${hit.productImage}`
      : null,
    platform: hit.platform ?? null,
    publisher: hit.softwarePublisher ?? null,
    developer: hit.softwareDeveloper ?? null,
    release_date: hit.releaseDate ? hit.releaseDate.slice(0, 10) : null,
    genres: hit.gameGenreLabels ?? [],
    player_count: hit.playerCount ?? null,
    max_players: maxPlayers,
    multiplayer,
    local_multiplayer: local,
    online_multiplayer: online,
    coop,
    play_modes: (hit.playModes ?? []).filter((m) => PLAY_MODES.has(m)),
    features: hit.gameFeatureLabels ?? [],
    ways_to_play: wayLabels,
    esrb_rating: hit.contentRating?.label ?? null,
    description: hit.description ?? null,
    store_url: hit.url ? `https://www.nintendo.com${hit.url}` : null,
  };
}

/** Ask Nintendo's image CDN for a smaller rendition of an eShop icon. */
export function sizedImage(url: string | null | undefined, width: number): string | undefined {
  if (!url) return undefined;
  if (url.includes('assets.nintendo.com/image/fetch/')) {
    return url.replace('/image/fetch/q_auto/f_auto/', `/image/fetch/q_auto/f_auto/w_${width}/`);
  }
  if (url.includes('assets.nintendo.com/image/upload/c_fill,w_512,h_512/')) {
    return url.replace('c_fill,w_512,h_512', `c_fill,w_${width},h_${width}`);
  }
  return url;
}
