import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Search, Star } from 'lucide-react';
import { api } from '../api';
import { favoriteGames } from '../lib/library';
import { play } from '../lib/sounds';
import { useAction, useFamily } from '../state/data';
import { useFamilies } from '../state/families';
import type { Game } from '../types';
import { GameIcon } from './GameIcon';
import { Modal, Spinner } from './ui';

const MAX = 5;

/** Five tiles; empty slots are dashed placeholders. */
export function FavoriteSlots({ games, onEdit }: { games: Game[]; onEdit?: () => void }) {
  return (
    <div className="fav-slots">
      {Array.from({ length: MAX }, (_, i) => {
        const g = games[i];
        return g ? (
          <Link key={g.id} to={`/games/${g.id}`} className="fav-slot" title={g.title}>
            <span className="selectable">
              <GameIcon game={g} size={150} />
            </span>
            <span className="fav-slot-title">{g.title}</span>
          </Link>
        ) : onEdit ? (
          <button key={i} type="button" className="fav-slot fav-slot-empty" onClick={onEdit} aria-label="Choose a favourite game">
            <Star size={22} />
          </button>
        ) : null;
      })}
    </div>
  );
}

/** Settings panel: pick up to five of your games to show on your profile. */
export function FavoritesPanel() {
  const family = useFamily();
  const { current } = useFamilies();
  const { run, busy } = useAction();
  const me = family.profileById.get(family.meId);
  const current5 = useMemo(() => favoriteGames(me, family.items, family.gameById), [me, family.items, family.gameById]);
  const myGames = useMemo(() => {
    const ids = [...new Set(family.items.filter((i) => i.owner_id === family.meId).map((i) => i.game_id))];
    return ids
      .map((id) => family.gameById.get(id))
      .filter((g): g is Game => !!g)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [family.items, family.gameById, family.meId]);

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) {
      setPicked(current5.map((g) => g.id));
      setQ('');
    }
  }, [open, current5]);

  const toggle = (id: string) => {
    play('tick');
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX ? p : [...p, id]));
  };
  const shown = myGames.filter((g) => g.title.toLowerCase().includes(q.trim().toLowerCase()));

  if (family.loading || !current) return null;

  return (
    <section className="panel settings-list">
      <div className="section-head">
        <h2 className="panel-title fav-title">
          <Star size={20} /> Favourite games
        </h2>
        {myGames.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
            {current5.length ? 'Change' : 'Choose'}
          </button>
        )}
      </div>
      <p className="muted small bottom-gap">
        Pick up to 5 of your games. They’re shown on your card in the Family tab and on your profile in <b>{current.name}</b>
        {current5.length ? '.' : ' — until then, your most recently added games are shown.'}
      </p>
      {myGames.length ? (
        <FavoriteSlots games={current5} onEdit={() => setOpen(true)} />
      ) : (
        <p className="muted">
          Add games to your library first. <Link to="/library">Go to My Games →</Link>
        </p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose your favourites"
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                const r = await run(() => api.setFavoriteGames(picked), { success: picked.length ? 'Favourites saved! ⭐' : 'Favourites cleared.' });
                if (r.ok) setOpen(false);
              }}
            >
              {busy ? <Spinner size={18} /> : <Check size={18} />} Save ({picked.length}/{MAX})
            </button>
          </>
        }
      >
        <p className="muted small bottom-gap">Tap games in the order you want them shown. Tap again to remove.</p>
        {myGames.length > 8 && (
          <div className="search-input bottom-gap">
            <Search size={18} aria-hidden="true" />
            <input type="search" aria-label="Find a game" placeholder="Find a game…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        <div className="fav-picker">
          {shown.map((g) => {
            const n = picked.indexOf(g.id);
            const full = n < 0 && picked.length >= MAX;
            return (
              <button
                key={g.id}
                type="button"
                className={`fav-pick${n >= 0 ? ' on' : ''}${full ? ' full' : ''}`}
                aria-pressed={n >= 0}
                disabled={full}
                onClick={() => toggle(g.id)}
                title={g.title}
              >
                <span className="fav-pick-art">
                  <GameIcon game={g} size={120} />
                  {n >= 0 && <span className="fav-pick-num">{n + 1}</span>}
                </span>
                <span className="fav-pick-title">{g.title}</span>
              </button>
            );
          })}
          {shown.length === 0 && <p className="muted">No games match “{q}”.</p>}
        </div>
      </Modal>
    </section>
  );
}
