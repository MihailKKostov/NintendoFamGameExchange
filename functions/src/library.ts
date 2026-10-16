import { onCall } from 'firebase-functions/v2/https';
import { db, fail, id, loadFamily, nameOf, now, requireAuth, str } from './common.js';
import { logEvent, notify } from './loanHelpers.js';

const FORMATS = ['physical', 'digital'];
const CONDITIONS = ['mint', 'good', 'fair', 'worn'];

function strList(v: unknown, max = 30, len = 80): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim().slice(0, len)).slice(0, max);
}
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null);
const https = (v: unknown) => (typeof v === 'string' && /^https:\/\/\S+$/.test(v) && v.length <= 1000 ? v : null);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Whitelist the game fields we keep, whatever the client sent. */
function cleanGame(g: Record<string, unknown>) {
  const nsuid = typeof g.nsuid === 'string' && /^[0-9A-Za-z]{4,32}$/.test(g.nsuid) ? g.nsuid : null;
  const maxPlayers = Number(g.max_players);
  return {
    nsuid,
    title: str(g.title, 'Game title', { min: 1, max: 200 })!,
    icon_url: https(g.icon_url),
    hero_url: https(g.hero_url),
    platform: text(g.platform, 60),
    publisher: text(g.publisher, 120),
    developer: text(g.developer, 120),
    release_date: typeof g.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.release_date) ? g.release_date : null,
    genres: strList(g.genres, 12, 40),
    player_count: text(g.player_count, 40),
    max_players: Number.isInteger(maxPlayers) && maxPlayers >= 1 && maxPlayers <= 100 ? maxPlayers : null,
    multiplayer: bool(g.multiplayer),
    local_multiplayer: bool(g.local_multiplayer),
    online_multiplayer: bool(g.online_multiplayer),
    coop: bool(g.coop),
    play_modes: strList(g.play_modes, 6, 40),
    features: strList(g.features, 20, 80),
    ways_to_play: strList(g.ways_to_play, 20, 80),
    esrb_rating: text(g.esrb_rating, 40),
    description: text(g.description, 4000),
    store_url: https(g.store_url),
  };
}

export const addToLibrary = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const p = (req.data ?? {}) as Record<string, unknown>;
  const fid = id(p.familyId, 'family');
  const format = FORMATS.includes(p.format as string) ? (p.format as string) : 'physical';
  const condition = format === 'physical' && CONDITIONS.includes(p.condition as string) ? (p.condition as string) : null;
  const notes = str(p.notes, 'Notes', { max: 500, optional: true });
  const input = (p.game ?? {}) as Record<string, unknown>;

  return db.runTransaction(async (tx) => {
    await loadFamily(fid, uid, tx);
    const games = db.collection(`families/${fid}/games`);
    let gameId: string;

    if (typeof input.id === 'string' && !input.title) {
      gameId = id(input.id, 'game');
      if (!(await tx.get(games.doc(gameId))).exists) fail('not-found', 'That game is not in the family catalog.');
    } else {
      const game = cleanGame(input);
      const ref = game.nsuid ? games.doc(`ns_${game.nsuid}`) : games.doc();
      gameId = ref.id;
      const existing = game.nsuid ? await tx.get(ref) : null;
      if (!existing?.exists) {
        tx.set(ref, { ...game, source: game.nsuid ? 'nintendo' : 'manual', created_by: uid, created_at: now() });
      }
    }

    const item = db.collection(`families/${fid}/items`).doc();
    tx.create(item, {
      owner_id: uid, game_id: gameId, format, condition, notes, lendable: true, created_at: now(),
    });
    return { itemId: item.id, gameId };
  });
});

export const removeLibraryItem = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const p = (req.data ?? {}) as Record<string, unknown>;
  const fid = id(p.familyId, 'family');
  const itemId = id(p.itemId, 'item');

  return db.runTransaction(async (tx) => {
    await loadFamily(fid, uid, tx);
    const itemRef = db.doc(`families/${fid}/items/${itemId}`);
    const item = await tx.get(itemRef);
    if (!item.exists) return { ok: true };
    if (item.get('owner_id') !== uid) fail('permission-denied', 'You can only remove your own games.');

    const open = await tx.get(
      db.collection(`families/${fid}/loans`).where('item_id', '==', itemId).where('status', 'in', ['pending', 'active']),
    );
    if (open.docs.some((d) => d.get('status') === 'active')) {
      fail('failed-precondition', 'This game is currently lent out — mark it returned first.');
    }
    const game = await tx.get(db.doc(`families/${fid}/games/${item.get('game_id')}`));
    const actorName = await nameOf(fid, uid, tx);

    for (const loan of open.docs) {
      const body = 'The owner removed this game from their library.';
      tx.update(loan.ref, { status: 'cancelled', responded_at: now(), updated_at: now() });
      logEvent(tx, fid, loan.id, uid, 'cancelled', body);
      notify(tx, {
        userId: loan.get('borrower_id'), familyId: fid, actorId: uid, actorName, kind: 'loan_cancelled', body,
        loanId: loan.id, gameTitle: game.get('title') ?? null, gameIcon: game.get('icon_url') ?? null,
      });
    }
    tx.delete(itemRef);
    return { ok: true };
  });
});
