import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Ban, CalendarDays, Check, CircleCheck, Gift, Hand, MessageCircle, Send, Undo2, X,
} from 'lucide-react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { GameIcon } from '../components/GameIcon';
import { DueDialog, RespondDialog, ReturnDialog } from '../components/LoanDialogs';
import { LoanStatusPill } from '../components/Status';
import { EmptyState, PageLoader, Spinner } from '../components/ui';
import { displayName, dueLabel, formatDate, timeAgo } from '../lib/format';
import { useAction, useFamily, useLoanEvents } from '../state/data';
import type { LoanEvent } from '../types';

const EVENT_TEXT: Record<LoanEvent['kind'], [string, React.ReactNode]> = {
  requested: ['asked to borrow it', <Hand size={14} key="i" />],
  accepted: ['accepted the request', <CircleCheck size={14} key="i" />],
  declined: ['declined the request', <Ban size={14} key="i" />],
  cancelled: ['cancelled the request', <X size={14} key="i" />],
  lent: ['lent the game', <Gift size={14} key="i" />],
  returned: ['marked it as returned', <Undo2 size={14} key="i" />],
  comment: ['', <MessageCircle size={14} key="i" />],
  due_changed: ['changed the due date', <CalendarDays size={14} key="i" />],
};

export function LoanPage() {
  const { loanId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const family = useFamily();
  const events = useLoanEvents(loanId);
  const { run, busy } = useAction();
  const [dialog, setDialog] = useState<null | 'accept' | 'decline' | 'return' | 'due'>(null);
  const [comment, setComment] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loan = family.loans.find((l) => l.id === loanId);
  const me = family.meId;
  const isLender = loan?.lender_id === me;
  const isBorrower = loan?.borrower_id === me;

  // Deep links from emails: #/loans/<id>?action=accept|decline
  useEffect(() => {
    const action = params.get('action');
    if (!loan || !action) return;
    if (loan.status === 'pending' && isLender && (action === 'accept' || action === 'decline')) setDialog(action);
    setParams({}, { replace: true });
  }, [loan, params, isLender, setParams]);

  useEffect(() => {
    if (events.data?.length) endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [events.data?.length]);

  if (family.loading) return <PageLoader />;
  if (!loan) {
    return (
      <div className="page">
        <EmptyState title="Loan not found" action={<Link to="/loans" className="btn btn-primary">Go to loans</Link>}>
          It may have been removed.
        </EmptyState>
      </div>
    );
  }

  const game = family.gameById.get(loan.game_id);
  const lender = family.profileById.get(loan.lender_id);
  const borrower = family.profileById.get(loan.borrower_id);
  const due = loan.status === 'active' ? dueLabel(loan.due_at) : null;
  const participant = isLender || isBorrower;

  const sendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    const res = await run(() => api.commentOnLoan(loan.id, comment), { emails: true });
    if (res.ok) setComment('');
  };

  let headline: string;
  if (loan.status === 'pending') {
    headline = isLender
      ? `${displayName(borrower)} would like to borrow your game`
      : isBorrower
        ? `Waiting for ${displayName(lender)} to answer`
        : `${displayName(borrower)} asked ${displayName(lender)} to borrow this`;
  } else if (loan.status === 'active') {
    headline = isLender ? `Lent to ${displayName(borrower)}` : isBorrower ? `Borrowed from ${displayName(lender)}` : `${displayName(borrower)} is borrowing this`;
  } else if (loan.status === 'returned') headline = 'Returned — thanks for sharing!';
  else if (loan.status === 'declined') headline = 'This request was declined';
  else headline = 'This request was cancelled';

  return (
    <div className="page loan-page">
      <button type="button" className="btn btn-ghost back-btn" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/loans'))}>
        <ArrowLeft size={18} /> Back
      </button>

      <section className={`loan-hero loan-hero-${loan.status}`}>
        {game && (
          <Link to={`/games/${game.id}`} className="loan-hero-icon selectable">
            <GameIcon game={game} size={180} />
          </Link>
        )}
        <div className="loan-hero-body">
          <LoanStatusPill status={loan.status} />
          <h1>{game?.title}</h1>
          <p className="loan-headline">{headline}</p>

          <div className="handoff">
            <Link to={`/members/${loan.lender_id}`} className="handoff-person">
              <Avatar profile={lender} size={56} />
              <span>{isLender ? 'You' : displayName(lender)}</span>
              <span className="muted small">owner</span>
            </Link>
            <div className={`handoff-arrow handoff-${loan.status}`} aria-hidden="true">
              <span />
              <Gift size={20} />
              <span />
            </div>
            <Link to={`/members/${loan.borrower_id}`} className="handoff-person">
              <Avatar profile={borrower} size={56} />
              <span>{isBorrower ? 'You' : displayName(borrower)}</span>
              <span className="muted small">borrower</span>
            </Link>
          </div>

          <dl className="loan-dates">
            {loan.requested_at && (
              <div>
                <dt>Requested</dt>
                <dd>{formatDate(loan.requested_at)}</dd>
              </div>
            )}
            {loan.lent_at && (
              <div>
                <dt>Lent</dt>
                <dd>{formatDate(loan.lent_at)}</dd>
              </div>
            )}
            {(loan.status === 'active' || loan.due_at) && loan.status !== 'returned' && (
              <div>
                <dt>Return by</dt>
                <dd>
                  {loan.due_at ? formatDate(loan.due_at) : 'No due date'}
                  {due && <span className={`due due-${due.tone}`}>{due.text}</span>}
                </dd>
              </div>
            )}
            {loan.returned_at && (
              <div>
                <dt>Returned</dt>
                <dd>{formatDate(loan.returned_at)}</dd>
              </div>
            )}
          </dl>

          <div className="row gap wrap loan-actions">
            {loan.status === 'pending' && isLender && (
              <>
                <button type="button" className="btn btn-green btn-lg" onClick={() => setDialog('accept')}>
                  <Check size={20} /> Accept
                </button>
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => setDialog('decline')}>
                  <X size={20} /> Decline
                </button>
              </>
            )}
            {loan.status === 'pending' && isBorrower && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => run(() => api.cancelLoanRequest(loan.id, ''), { emails: true, success: 'Request cancelled.' })}
              >
                <X size={18} /> Cancel request
              </button>
            )}
            {loan.status === 'active' && participant && (
              <button type="button" className="btn btn-green" onClick={() => setDialog('return')}>
                <Undo2 size={18} /> {isLender ? 'I got it back' : 'I returned it'}
              </button>
            )}
            {loan.status === 'active' && isLender && (
              <button type="button" className="btn btn-secondary" onClick={() => setDialog('due')}>
                <CalendarDays size={18} /> Change due date
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="panel timeline-panel">
        <h2 className="panel-title">Activity</h2>
        {events.isLoading ? (
          <Spinner />
        ) : (
          <ol className="timeline">
            {(events.data ?? []).map((ev) => {
              const actor = family.profileById.get(ev.actor_id ?? '');
              const mine = ev.actor_id === me;
              const [text, icon] = EVENT_TEXT[ev.kind];
              if (ev.kind === 'comment') {
                return (
                  <li key={ev.id} className={`bubble-row${mine ? ' mine' : ''}`}>
                    <Avatar profile={actor} size={34} />
                    <div className="bubble">
                      <p>{ev.body}</p>
                      <span className="bubble-meta">
                        {mine ? 'You' : displayName(actor)} · {timeAgo(ev.created_at)}
                      </span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={ev.id} className={`event event-${ev.kind}`}>
                  <span className="event-icon">{icon}</span>
                  <div>
                    <p>
                      <b>{mine ? 'You' : displayName(actor)}</b> {text}
                      <span className="muted small"> · {timeAgo(ev.created_at)}</span>
                    </p>
                    {ev.body && <p className="event-body">{ev.kind === 'due_changed' ? ev.body : `“${ev.body}”`}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
        {participant ? (
          <form className="comment-box" onSubmit={sendComment}>
            <Avatar profile={family.me} size={36} />
            <textarea
              className="input"
              rows={1}
              maxLength={2000}
              placeholder={`Message ${displayName(isLender ? borrower : lender)}…`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendComment(e as unknown as React.FormEvent);
                }
              }}
            />
            <button type="submit" className="btn btn-primary btn-icon" aria-label="Send" disabled={!comment.trim() || busy}>
              <Send size={18} />
            </button>
          </form>
        ) : (
          <p className="muted small">Only {displayName(lender)} and {displayName(borrower)} can comment here.</p>
        )}
      </section>

      <RespondDialog open={dialog === 'accept' || dialog === 'decline'} accept={dialog === 'accept'} loan={loan} onClose={() => setDialog(null)} />
      <ReturnDialog open={dialog === 'return'} loan={loan} onClose={() => setDialog(null)} />
      <DueDialog open={dialog === 'due'} loan={loan} onClose={() => setDialog(null)} />
    </div>
  );
}
