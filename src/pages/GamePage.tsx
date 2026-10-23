import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Gift, Hand, Pencil, Plus, Star, Tag, ThumbsUp } from 'lucide-react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { GameFacts } from '../components/GameFacts';
import { GameIcon } from '../components/GameIcon';
import { conditionLabel, ItemDialog, LendDialog, RequestDialog } from '../components/LoanDialogs';
import { CopyStatePill } from '../components/Status';
import { formatRating, GameOpinions } from '../components/Rating';
import { StoreGallery, StoreGallerySkeleton } from '../components/StoreGallery';
import { EmptyState, PageLoader } from '../components/ui';
import { displayName, dueLabel, formatDate } from '../lib/format';
import { copyState, ratingSummaryFor, type CopyInfo } from '../lib/library';
import { dekuDealsUrl, fetchStoreDetails } from '../lib/nintendo';
import { useAction, useFamily } from '../state/data';
import type { Game } from '../types';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function CopyRow({ copy, game }: { copy: CopyInfo; game: Game }) {
  const family = useFamily();
  const navigate = useNavigate();
  const { run } = useAction();
  const [dialog, setDialog] = useState<null | 'request' | 'lend' | 'edit'>(null);
  const state = copyState(copy, family.meId);
  const borrower = copy.active ? family.profileById.get(copy.active.borrower_id) : undefined;
  const due = dueLabel(copy.active?.due_at ?? null);
  const cond = conditionLabel(copy.item.condition);

  return (
    <li className="copy-row">
      <Link to={`/members/${copy.item.owner_id}`} className="copy-owner">
        <Avatar profile={copy.owner} size={48} />
        <span>
          <b>{state === 'mine' || state === 'mine_lent' ? 'You' : displayName(copy.owner)}</b>
          <span className="muted small">
            {copy.item.format === 'digital' ? 'Digital' : 'Game card'}
            {cond && ` · ${cond}`} · added {formatDate(copy.item.created_at, { year: undefined })}
          </span>
        </span>
      </Link>
      <div className="copy-status">
        <CopyStatePill state={state} />
        {copy.active && (
          <span className="muted small">
            {borrower?.id === family.meId ? 'with you' : `with ${displayName(borrower)}`}
            {due && <> · <span className={`due-text due-${due.tone}`}>{due.text}</span></>}
          </span>
        )}
        {copy.pending.length > 0 && (state === 'mine' || state === 'mine_lent') && (
          <span className="muted small">
            {copy.pending.length} request{copy.pending.length === 1 ? '' : 's'} waiting
          </span>
        )}
        {copy.item.notes && <span className="copy-notes">📝 {copy.item.notes}</span>}
      </div>
      <div className="copy-actions">
        {(state === 'available' || state === 'on_loan') && (
          <button type="button" className="btn btn-primary" onClick={() => setDialog('request')}>
            <Hand size={18} /> {state === 'on_loan' ? 'Request next' : 'Request to borrow'}
          </button>
        )}
        {state === 'requested' && copy.myRequest && (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(`/loans/${copy.myRequest!.id}`)}>
              View request
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => run(() => api.cancelLoanRequest(copy.myRequest!.id, ''), { success: 'Request cancelled.' })}
            >
              Cancel
            </button>
          </>
        )}
        {state === 'borrowed' && copy.active && (
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/loans/${copy.active!.id}`)}>
            View loan
          </button>
        )}
        {state === 'mine' && (
          <>
            {copy.pending.length > 0 ? (
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/loans/${copy.pending[0].id}`)}>
                Answer request
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => setDialog('lend')}>
                <Gift size={18} /> Lend
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="Edit your copy" onClick={() => setDialog('edit')}>
              <Pencil size={18} />
            </button>
          </>
        )}
        {state === 'mine_lent' && copy.active && (
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/loans/${copy.active!.id}`)}>
            View loan
          </button>
        )}
      </div>
      <RequestDialog open={dialog === 'request'} onClose={() => setDialog(null)} item={copy.item} game={game} owner={copy.owner} />
      <LendDialog open={dialog === 'lend'} onClose={() => setDialog(null)} item={copy.item} />
      <ItemDialog open={dialog === 'edit'} onClose={() => setDialog(null)} item={copy.item} />
    </li>
  );
}

export function GamePage() {
  const { gameId = '' } = useParams();
  const family = useFamily();
  const navigate = useNavigate();
  const { run, busy } = useAction();
  const entry = family.entryByGame.get(gameId);
  const game = entry?.game ?? family.gameById.get(gameId);
  const store = useQuery({
    queryKey: ['store-details', game?.nsuid ?? null, game?.title ?? ''],
    queryFn: ({ signal }) => fetchStoreDetails(game!, signal),
    enabled: !!game && game.source !== 'manual',
    staleTime: 24 * 60 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });
  const basePrice = store.data?.basePrice;
  const opinions = ratingSummaryFor(family.ratingByGame, gameId);

  if (family.loading) return <PageLoader />;
  if (!game) {
    return (
      <div className="page">
        <EmptyState title="Game not found" action={<Link to="/browse" className="btn btn-primary">Browse games</Link>}>
          It may have been removed from the family library.
        </EmptyState>
      </div>
    );
  }

  const copies = [...(entry?.copies ?? [])].sort((a, b) => {
    const rank = (c: CopyInfo) => ({ available: 0, requested: 1, borrowed: 1, on_loan: 2, unavailable: 3, mine: 4, mine_lent: 4 })[copyState(c, family.meId)];
    return rank(a) - rank(b);
  });

  return (
    <div className="page game-page">
      <button type="button" className="btn btn-ghost back-btn" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/browse'))}>
        <ArrowLeft size={18} /> Back
      </button>

      <section className="game-hero">
        {game.hero_url && (
          <div className="game-hero-bg" aria-hidden="true">
            <img src={game.hero_url} alt="" />
          </div>
        )}
        <div className="game-hero-content">
          <GameIcon game={game} size={240} className="game-hero-icon" />
          <div className="game-hero-text">
            {game.platform && <span className="platform-chip">{game.platform}</span>}
            <h1>{game.title}</h1>
            <p className="game-hero-sub">
              {[game.publisher, game.release_date?.slice(0, 4)].filter(Boolean).join(' · ')}
            </p>
            {(basePrice != null || opinions.rating != null || opinions.recommendedBy.length > 0) && (
              <div className="row gap-s wrap">
                {opinions.rating != null && (
                  <span className="price-chip rating-chip" title={`Family rating from ${opinions.ratingCount} ${opinions.ratingCount === 1 ? 'person' : 'people'}`}>
                    <Star size={15} fill="currentColor" strokeWidth={0} /> {formatRating(opinions.rating)}
                    <span className="chip-sub">({opinions.ratingCount})</span>
                  </span>
                )}
                {opinions.recommendedBy.length > 0 && (
                  <span className="price-chip" title="Recommended by family members">
                    <ThumbsUp size={15} fill="currentColor" /> {opinions.recommendedBy.length} recommend{opinions.recommendedBy.length === 1 ? 's' : ''}
                  </span>
                )}
                {basePrice != null && (
                  <span className="price-chip" title="Regular price on the US Nintendo eShop">
                    <Tag size={15} /> {usd.format(basePrice)}
                  </span>
                )}
              </div>
            )}
            <div className="row gap wrap">
              {game.store_url && (
                <a href={game.store_url} target="_blank" rel="noreferrer" className="btn btn-glass btn-sm">
                  <ExternalLink size={16} /> Nintendo.com
                </a>
              )}
              <a href={dekuDealsUrl(game.title)} target="_blank" rel="noreferrer" className="btn btn-glass btn-sm">
                <ExternalLink size={16} /> Deku Deals
              </a>
              <button
                type="button"
                className="btn btn-glass btn-sm"
                disabled={busy}
                onClick={() => run(() => api.addToLibrary({ id: game.id }, { format: 'physical' }), { success: `Added ${game.title} to your library!` })}
              >
                <Plus size={16} /> {entry?.copies.some((c) => c.item.owner_id === family.meId) ? 'Add another copy' : 'I own this too'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {store.isPending && store.fetchStatus !== 'idle' ? (
        <StoreGallerySkeleton />
      ) : store.data?.media.length ? (
        <StoreGallery media={store.data.media} title={game.title} />
      ) : null}

      <div className="game-layout">
        <section className="panel">
          <div className="section-head">
            <h2>Copies in the family</h2>
            <span className="muted">{copies.length}</span>
          </div>
          {copies.length ? (
            <ul className="copy-list">
              {copies.map((c) => (
                <CopyRow key={c.item.id} copy={c} game={game} />
              ))}
            </ul>
          ) : (
            <p className="muted">Nobody has this game in their library right now.</p>
          )}
        </section>

        <div className="game-side">
        <GameOpinions gameId={game.id} summary={opinions} />
        <section className="panel">
          <h2 className="panel-title">About this game</h2>
          <GameFacts
            game={game}
            extra={basePrice != null ? [['Base price', <>{usd.format(basePrice)} <span className="muted small">US eShop</span></>]] : []}
          />
          {game.description && <p className="game-desc">{game.description}</p>}
        </section>
        </div>
      </div>
    </div>
  );
}
