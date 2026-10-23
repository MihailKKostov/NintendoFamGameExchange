import { useEffect, useState } from 'react';
import { Star, ThumbsUp } from 'lucide-react';
import { api } from '../api';
import { displayName } from '../lib/format';
import type { RatingSummary } from '../lib/library';
import { play } from '../lib/sounds';
import { useAction, useFamily } from '../state/data';
import { Avatar } from './Avatar';

export const formatRating = (r: number) => (Math.round(r * 10) / 10).toFixed(1);

/** Five stars filled to `value` (fractions allowed), read-only. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (cls: string) => (
    <span className={cls}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={size} fill="currentColor" strokeWidth={0} />
      ))}
    </span>
  );
  return (
    <span className="stars" role="img" aria-label={`${formatRating(value)} out of 5 stars`}>
      {row('stars-empty')}
      <span className="stars-fill" style={{ width: `${pct}%` }}>
        {row('stars-full')}
      </span>
    </span>
  );
}

/** Compact "★ 4.3" for cards and lists. */
export function RatingBadge({ rating, count }: { rating: number | null; count?: number }) {
  if (rating == null) return null;
  return (
    <span className="rating-badge" title={count ? `${formatRating(rating)} from ${count} rating${count === 1 ? '' : 's'}` : undefined}>
      <Star size={13} fill="currentColor" strokeWidth={0} />
      {formatRating(rating)}
    </span>
  );
}

const WORDS = ['', 'Not for me', 'It’s OK', 'Good', 'Great', 'Loved it!'];

/** Tap a star to rate; tap your current rating again to clear it. */
export function StarInput({ value, onChange, disabled }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="star-input-wrap">
      <div className="star-input" role="radiogroup" aria-label="Your rating" onPointerLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}${value === n ? ' (tap again to clear)' : ''}`}
            className={n <= shown ? 'on' : ''}
            disabled={disabled}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(n)}
            onClick={() => {
              play(value === n ? 'back' : 'tick');
              onChange(value === n ? null : n);
            }}
          >
            <Star size={30} fill="currentColor" strokeWidth={0} />
          </button>
        ))}
      </div>
      <span className="star-input-word">{shown ? WORDS[shown] : 'Tap to rate'}</span>
    </div>
  );
}

export function RecommendButton({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`recommend-btn${on ? ' on' : ''}`}
      aria-pressed={on}
      disabled={disabled}
      onClick={() => {
        play(on ? 'back' : 'toggle');
        onChange(!on);
      }}
    >
      <ThumbsUp size={18} fill={on ? 'currentColor' : 'none'} />
      {on ? 'You recommend this' : 'Recommend'}
    </button>
  );
}

/** Game page panel: the family's average, your rating and recommendation, and everyone's opinions. */
export function GameOpinions({ gameId, summary }: { gameId: string; summary: RatingSummary }) {
  const family = useFamily();
  const { run } = useAction();
  const mine = summary.opinions.find((o) => o.user_id === family.meId);
  // Show your change straight away while it saves.
  const [draft, setDraft] = useState<{ rating: number | null; recommended: boolean } | null>(null);
  useEffect(() => setDraft(null), [mine?.rating, mine?.recommended]);
  const myRating = draft ? draft.rating : (mine?.rating ?? null);
  const myRec = draft ? draft.recommended : !!mine?.recommended;

  const save = async (patch: { rating?: number | null; recommended?: boolean }) => {
    const next = { rating: myRating, recommended: myRec, ...patch };
    setDraft(next);
    const r = await run(() => api.setGameOpinion(gameId, patch));
    if (!r.ok) setDraft(null);
  };

  const others = summary.opinions
    .filter((o) => o.user_id !== family.meId)
    .map((o) => ({ o, p: family.profileById.get(o.user_id) }))
    .filter((x) => !!x.p)
    .sort((a, b) => Number(b.o.recommended) - Number(a.o.recommended) || (b.o.rating ?? 0) - (a.o.rating ?? 0));

  return (
    <section className="panel opinions-panel">
      <h2 className="panel-title">Family rating</h2>
      <div className="rating-summary">
        {summary.rating != null ? (
          <>
            <b className="rating-big">{formatRating(summary.rating)}</b>
            <span className="rating-summary-side">
              <Stars value={summary.rating} size={20} />
              <span className="muted small">
                {summary.ratingCount} rating{summary.ratingCount === 1 ? '' : 's'}
                {summary.recommendedBy.length > 0 && ` · ${summary.recommendedBy.length} recommend${summary.recommendedBy.length === 1 ? 's' : ''} it`}
              </span>
            </span>
          </>
        ) : (
          <span className="muted">
            Nobody has rated this yet{summary.recommendedBy.length > 0 && ` · ${summary.recommendedBy.length} recommend${summary.recommendedBy.length === 1 ? 's' : ''} it`}.
          </span>
        )}
      </div>

      <div className="my-opinion">
        <span className="my-opinion-label">Your rating</span>
        <StarInput value={myRating} onChange={(v) => void save({ rating: v })} />
        <RecommendButton on={myRec} onChange={(v) => void save({ recommended: v })} />
      </div>

      {others.length > 0 && (
        <ul className="opinion-list">
          {others.map(({ o, p }) => (
            <li key={o.id}>
              <Avatar profile={p} size={34} link />
              <span className="opinion-name">{displayName(p)}</span>
              {o.rating != null ? <Stars value={o.rating} size={14} /> : <span className="muted small">No stars</span>}
              {o.recommended && (
                <span className="rec-tag" title="Recommends it">
                  <ThumbsUp size={13} fill="currentColor" /> Recommends
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
