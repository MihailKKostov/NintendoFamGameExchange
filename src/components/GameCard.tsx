import { Link } from 'react-router-dom';
import { ThumbsUp } from 'lucide-react';
import { yearOf } from '../lib/format';
import type { GameEntry } from '../lib/library';
import { AvatarStack } from './Avatar';
import { GameIcon } from './GameIcon';
import { RatingBadge } from './Rating';

export const shortPlatform = (p: string | null) =>
  !p ? null : p.replace(/^Nintendo\s+/i, '').replace(/^iOS\s*\/\s*Android$/i, 'Mobile');

export function GameCard({ entry, meId, showOwners = true }: { entry: GameEntry; meId: string; showOwners?: boolean }) {
  const { game, owners, availableCount, copies } = entry;
  const mine = copies.some((c) => c.item.owner_id === meId);
  const borrowed = copies.some((c) => c.active?.borrower_id === meId);
  const requested = copies.some((c) => c.myRequest);
  const othersCopies = copies.filter((c) => c.item.owner_id !== meId);

  const myPending = copies.filter((c) => c.item.owner_id === meId).reduce((n, c) => n + c.pending.length, 0);

  let status: { tone: string; text: string };
  if (myPending > 0) status = { tone: 'amber', text: `${myPending} request${myPending === 1 ? '' : 's'}` };
  else if (borrowed) status = { tone: 'purple', text: 'You have it' };
  else if (requested) status = { tone: 'amber', text: 'Requested' };
  else if (availableCount > 0) status = { tone: 'green', text: availableCount > 1 ? `${availableCount} available` : 'Available' };
  else if (othersCopies.length && othersCopies.every((c) => c.active)) status = { tone: 'cyan', text: 'On loan' };
  else if (mine && !othersCopies.length) status = { tone: 'neutral', text: copies.some((c) => c.active) ? 'Lent out' : 'Yours' };
  else status = { tone: 'neutral', text: 'Not lending' };

  const year = yearOf(game.release_date);
  const platform = shortPlatform(game.platform);
  return (
    <Link
      to={`/games/${game.id}`}
      className="game-card"
      aria-label={`${game.title} — ${status.text}${entry.rating != null ? `, rated ${entry.rating.toFixed(1)} of 5` : ''}${entry.recommendedBy.length ? ', recommended' : ''}`}
    >
      <span className="game-card-art selectable">
        <GameIcon game={game} size={200} />
        <span className={`card-status card-status-${status.tone}`}>
          <i />
          {status.text}
        </span>
        {entry.recommendedBy.length > 0 && (
          <span className="card-rec" title={`Recommended by ${entry.recommendedBy.length} ${entry.recommendedBy.length === 1 ? 'person' : 'people'}`}>
            <ThumbsUp size={13} fill="currentColor" />
            {entry.recommendedBy.length > 1 && entry.recommendedBy.length}
          </span>
        )}
      </span>
      <span className="game-card-body">
        <span className="game-card-title">{game.title}</span>
        <span className="game-card-meta">
          <RatingBadge rating={entry.rating} count={entry.ratingCount} />
          <span className="game-card-meta-text">{[game.genres[0], year].filter(Boolean).join(' · ') || platform}</span>
        </span>
        {showOwners && owners.length > 0 && (
          <span className="game-card-owners">
            <AvatarStack profiles={owners} size={22} max={4} />
          </span>
        )}
      </span>
    </Link>
  );
}

export function GameGrid({ entries, meId, showOwners }: { entries: GameEntry[]; meId: string; showOwners?: boolean }) {
  return (
    <div className="game-grid">
      {entries.map((e, i) => (
        <div key={e.game.id} className="game-grid-cell" style={{ animationDelay: `${Math.min(i, 24) * 18}ms` }}>
          <GameCard entry={e} meId={meId} showOwners={showOwners} />
        </div>
      ))}
    </div>
  );
}
