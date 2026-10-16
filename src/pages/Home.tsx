import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Gamepad2, LayoutGrid, Plus, Sparkles, X } from 'lucide-react';
import { AddGameDialog } from '../components/AddGameDialog';
import { Avatar } from '../components/Avatar';
import { GameIcon } from '../components/GameIcon';
import { RespondDialog } from '../components/LoanDialogs';
import { PageLoader } from '../components/ui';
import { displayName, dueLabel, greeting, timeAgo } from '../lib/format';
import type { GameEntry } from '../lib/library';
import { play } from '../lib/sounds';
import { useFamily } from '../state/data';
import type { Loan } from '../types';

/** The console-style row of big square tiles with the title floating above the selected one. */
function TileRow({ entries }: { entries: GameEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const scroll = (dir: 1 | -1) => {
    play('tick');
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <div className="tile-row-wrap">
      <button type="button" className="row-arrow left" aria-label="Scroll left" onClick={() => scroll(-1)}>
        <ChevronLeft size={22} />
      </button>
      <div className="tile-row" ref={ref}>
        {entries.map((e, i) => (
          <Link
            key={e.game.id}
            to={`/games/${e.game.id}`}
            className={`hero-tile${focus === i ? ' focused' : ''}`}
            onMouseEnter={() => setFocus(i)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(i)}
            onBlur={() => setFocus(null)}
            aria-label={e.game.title}
          >
            <span className="hero-tile-title">{e.game.title}</span>
            <span className="hero-tile-art selectable">
              <GameIcon game={e.game} size={220} />
            </span>
            <span className="hero-tile-owner">
              {e.owners.slice(0, 3).map((o) => (
                <Avatar key={o.id} profile={o} size={24} />
              ))}
            </span>
          </Link>
        ))}
        <Link to="/browse" className="hero-tile hero-tile-more" aria-label="See all games">
          <span className="hero-tile-title">See everything</span>
          <span className="hero-tile-art selectable">
            <LayoutGrid size={44} />
            <b>All games</b>
          </span>
        </Link>
      </div>
      <button type="button" className="row-arrow right" aria-label="Scroll right" onClick={() => scroll(1)}>
        <ChevronRight size={22} />
      </button>
    </div>
  );
}

function RequestCard({ loan }: { loan: Loan }) {
  const family = useFamily();
  const [respond, setRespond] = useState<null | boolean>(null);
  const game = family.gameById.get(loan.game_id);
  const borrower = family.profileById.get(loan.borrower_id);
  if (!game) return null;
  return (
    <div className="request-card">
      <Link to={`/loans/${loan.id}`} className="request-card-main">
        <GameIcon game={game} size={64} />
        <span className="request-card-text">
          <span className="row gap-s">
            <Avatar profile={borrower} size={22} />
            <b>{displayName(borrower)}</b>
            <span className="muted small">{timeAgo(loan.created_at)}</span>
          </span>
          <span className="request-card-game">wants to borrow <b>{game.title}</b></span>
          {loan.request_message && <span className="request-card-msg">“{loan.request_message}”</span>}
        </span>
      </Link>
      <div className="request-card-actions">
        <button type="button" className="btn btn-green btn-sm" onClick={() => setRespond(true)}>
          <Check size={16} /> Accept
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRespond(false)}>
          <X size={16} /> Decline
        </button>
      </div>
      <RespondDialog open={respond !== null} accept={!!respond} loan={loan} onClose={() => setRespond(null)} />
    </div>
  );
}

function LoanMini({ loan, perspective }: { loan: Loan; perspective: 'lender' | 'borrower' }) {
  const family = useFamily();
  const game = family.gameById.get(loan.game_id);
  const other = family.profileById.get(perspective === 'lender' ? loan.borrower_id : loan.lender_id);
  const due = dueLabel(loan.due_at);
  if (!game) return null;
  return (
    <Link to={`/loans/${loan.id}`} className="loan-mini selectable-soft">
      <GameIcon game={game} size={52} />
      <span className="loan-mini-text">
        <b>{game.title}</b>
        <span className="muted small row gap-s">
          {perspective === 'lender' ? 'with' : 'from'} <Avatar profile={other} size={18} /> {displayName(other)}
        </span>
      </span>
      {due && <span className={`due due-${due.tone}`}>{due.text}</span>}
    </Link>
  );
}

export function Home() {
  const family = useFamily();
  const [adding, setAdding] = useState(false);
  const { meId, me, loans, entries } = family;

  const recent = useMemo(
    () => [...entries].sort((a, b) => b.latestAdded.localeCompare(a.latestAdded)).slice(0, 14),
    [entries],
  );
  const incoming = loans.filter((l) => l.lender_id === meId && l.status === 'pending');
  const lentOut = loans.filter((l) => l.lender_id === meId && l.status === 'active');
  const borrowed = loans.filter((l) => l.borrower_id === meId && l.status === 'active');
  const myOutgoing = loans.filter((l) => l.borrower_id === meId && l.status === 'pending');
  const myCount = family.items.filter((i) => i.owner_id === meId).length;
  const availableToMe = entries.filter((e) => e.availableCount > 0).length;

  if (family.loading) return <PageLoader />;

  return (
    <div className="page home">
      <section className="home-hello">
        <Avatar profile={me} size={64} />
        <div>
          <h1>
            {greeting()}, {displayName(me)}!
          </h1>
          <p className="muted">
            {incoming.length
              ? `You have ${incoming.length} borrow request${incoming.length === 1 ? '' : 's'} waiting.`
              : borrowed.length
                ? `You’re borrowing ${borrowed.length} game${borrowed.length === 1 ? '' : 's'} right now.`
                : 'What are we playing next?'}
          </p>
        </div>
      </section>

      <section className="stats">
        <Link to="/browse" className="stat selectable-soft">
          <span className="stat-num">{entries.length}</span>
          <span className="stat-label">games in the family</span>
        </Link>
        <Link to="/browse?availability=available" className="stat selectable-soft">
          <span className="stat-num green">{availableToMe}</span>
          <span className="stat-label">available to borrow</span>
        </Link>
        <Link to="/loans?tab=lent" className="stat selectable-soft">
          <span className="stat-num cyan">{lentOut.length}</span>
          <span className="stat-label">you’ve lent out</span>
        </Link>
        <Link to="/loans?tab=borrowed" className="stat selectable-soft">
          <span className="stat-num purple">{borrowed.length}</span>
          <span className="stat-label">you’re borrowing</span>
        </Link>
      </section>

      {recent.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>New in the family library</h2>
            <Link to="/browse" className="section-link">
              Browse all <ChevronRight size={18} />
            </Link>
          </div>
          <TileRow entries={recent} />
        </section>
      )}

      {incoming.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>
              Requests for you <span className="count-bubble">{incoming.length}</span>
            </h2>
          </div>
          <div className="request-list">
            {incoming.map((l) => (
              <RequestCard key={l.id} loan={l} />
            ))}
          </div>
        </section>
      )}

      {myCount === 0 && (
        <section className="cta-card">
          <div className="cta-art" aria-hidden="true">
            <Gamepad2 size={56} />
          </div>
          <div className="cta-text">
            <h2>Add your games</h2>
            <p>Search the eShop, or snap a screenshot of your console’s game list and let us find them for you.</p>
          </div>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => setAdding(true)}>
            <Sparkles size={20} /> Add games
          </button>
        </section>
      )}

      <div className="home-columns">
        <section className="panel">
          <div className="section-head">
            <h3>Lent out</h3>
            <Link to="/loans?tab=lent" className="section-link small">
              All <ChevronRight size={16} />
            </Link>
          </div>
          {lentOut.length ? (
            lentOut.slice(0, 4).map((l) => <LoanMini key={l.id} loan={l} perspective="lender" />)
          ) : (
            <p className="muted small">Nothing out right now.</p>
          )}
        </section>
        <section className="panel">
          <div className="section-head">
            <h3>Borrowed</h3>
            <Link to="/loans?tab=borrowed" className="section-link small">
              All <ChevronRight size={16} />
            </Link>
          </div>
          {borrowed.length ? (
            borrowed.slice(0, 4).map((l) => <LoanMini key={l.id} loan={l} perspective="borrower" />)
          ) : (
            <p className="muted small">
              You’re not borrowing anything. <Link to="/browse?availability=available">Find something to play →</Link>
            </p>
          )}
          {myOutgoing.length > 0 && (
            <p className="muted small top-gap">
              <ArrowLeftRight size={14} /> {myOutgoing.length} request{myOutgoing.length === 1 ? '' : 's'} waiting for an answer.
            </p>
          )}
        </section>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>The family</h2>
          <Link to="/members" className="section-link">
            Everyone <ChevronRight size={18} />
          </Link>
        </div>
        <div className="family-row">
          {family.members.map((m) => {
            const count = family.items.filter((i) => i.owner_id === m.id).length;
            return (
              <Link key={m.id} to={`/members/${m.id}`} className="family-chip">
                <Avatar profile={m} size={68} />
                <b>{displayName(m)}</b>
                <span className="muted small">{count} game{count === 1 ? '' : 's'}</span>
              </Link>
            );
          })}
          <button type="button" className="family-chip add" onClick={() => setAdding(true)}>
            <span className="avatar ring add-circle" style={{ width: 68, height: 68 }}>
              <Plus size={28} />
            </span>
            <b>Add a game</b>
            <span className="muted small">to your library</span>
          </button>
        </div>
      </section>

      <AddGameDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
