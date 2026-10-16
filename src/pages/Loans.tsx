import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Gift, History, Inbox, Package, Undo2, X } from 'lucide-react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { GameIcon } from '../components/GameIcon';
import { RespondDialog, ReturnDialog } from '../components/LoanDialogs';
import { LoanStatusPill } from '../components/Status';
import { EmptyState, PageLoader } from '../components/ui';
import { displayName, dueLabel, formatDate, timeAgo } from '../lib/format';
import { play } from '../lib/sounds';
import { useAction, useFamily } from '../state/data';
import type { Loan } from '../types';

export function LoanRow({ loan, showActions = true }: { loan: Loan; showActions?: boolean }) {
  const family = useFamily();
  const { run, busy } = useAction();
  const [dialog, setDialog] = useState<null | 'accept' | 'decline' | 'return'>(null);
  const game = family.gameById.get(loan.game_id);
  const lender = family.profileById.get(loan.lender_id);
  const borrower = family.profileById.get(loan.borrower_id);
  const me = family.meId;
  const due = loan.status === 'active' ? dueLabel(loan.due_at) : null;
  if (!game) return null;

  const name = (id: string) => (id === me ? 'You' : displayName(family.profileById.get(id)));
  let when: string;
  switch (loan.status) {
    case 'pending':
      when = `Requested ${timeAgo(loan.requested_at ?? loan.created_at)}`;
      break;
    case 'active':
      when = `Since ${formatDate(loan.lent_at, { year: undefined })}`;
      break;
    case 'returned':
      when = `Returned ${formatDate(loan.returned_at)}`;
      break;
    default:
      when = `${loan.status === 'declined' ? 'Declined' : 'Cancelled'} ${formatDate(loan.responded_at ?? loan.updated_at)}`;
  }

  return (
    <li className={`loan-row loan-${loan.status}`}>
      <Link to={`/loans/${loan.id}`} className="loan-row-main">
        <GameIcon game={game} size={72} />
        <span className="loan-row-text">
          <span className="loan-row-title">{game.title}</span>
          <span className="loan-parties">
            <Avatar profile={lender} size={22} />
            <span>{name(loan.lender_id)}</span>
            <ArrowRight size={14} className="muted" />
            <Avatar profile={borrower} size={22} />
            <span>{name(loan.borrower_id)}</span>
          </span>
          <span className="loan-row-meta">
            <LoanStatusPill status={loan.status} />
            <span className="muted small">{when}</span>
            {due && <span className={`due due-${due.tone}`}>{due.text}</span>}
          </span>
          {loan.status === 'pending' && loan.request_message && <span className="loan-row-msg">“{loan.request_message}”</span>}
        </span>
      </Link>
      {showActions && (
        <div className="loan-row-actions">
          {loan.status === 'pending' && loan.lender_id === me && (
            <>
              <button type="button" className="btn btn-green btn-sm" onClick={() => setDialog('accept')}>
                <Check size={16} /> Accept
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog('decline')}>
                <X size={16} /> Decline
              </button>
            </>
          )}
          {loan.status === 'pending' && loan.borrower_id === me && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => run(() => api.cancelLoanRequest(loan.id, ''), { success: 'Request cancelled.' })}
            >
              <X size={16} /> Cancel request
            </button>
          )}
          {loan.status === 'active' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog('return')}>
              <Undo2 size={16} /> {loan.lender_id === me ? 'Got it back' : 'I returned it'}
            </button>
          )}
        </div>
      )}
      <RespondDialog open={dialog === 'accept' || dialog === 'decline'} accept={dialog === 'accept'} loan={loan} onClose={() => setDialog(null)} />
      <ReturnDialog open={dialog === 'return'} loan={loan} onClose={() => setDialog(null)} />
    </li>
  );
}

type Tab = 'requests' | 'lent' | 'borrowed' | 'history';

export function Loans() {
  const family = useFamily();
  const [params, setParams] = useSearchParams();
  const tab = (['requests', 'lent', 'borrowed', 'history'].includes(params.get('tab') ?? '') ? params.get('tab') : 'requests') as Tab;
  const me = family.meId;
  const mine = family.loans.filter((l) => l.lender_id === me || l.borrower_id === me);

  const incoming = mine.filter((l) => l.status === 'pending' && l.lender_id === me);
  const outgoing = mine.filter((l) => l.status === 'pending' && l.borrower_id === me);
  const lent = mine.filter((l) => l.status === 'active' && l.lender_id === me);
  const borrowed = mine.filter((l) => l.status === 'active' && l.borrower_id === me);
  const history = mine
    .filter((l) => ['returned', 'declined', 'cancelled'].includes(l.status))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const byDue = (a: Loan, b: Loan) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999');

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number; alert?: boolean }[] = [
    { id: 'requests', label: 'Requests', icon: <Inbox size={18} />, count: incoming.length + outgoing.length, alert: incoming.length > 0 },
    { id: 'lent', label: 'Lent out', icon: <Gift size={18} />, count: lent.length },
    { id: 'borrowed', label: 'Borrowed', icon: <Package size={18} />, count: borrowed.length },
    { id: 'history', label: 'History', icon: <History size={18} />, count: history.length },
  ];

  if (family.loading) return <PageLoader />;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Loans</h1>
          <p className="muted">Keep track of what you’ve given away and what you’ve received.</p>
        </div>
      </header>

      <div className="tabs tabs-line" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => {
              play('tick');
              setParams(t.id === 'requests' ? {} : { tab: t.id }, { replace: true });
            }}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.count > 0 && <span className={`tab-count${t.alert ? ' alert' : ''}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="tab-content" key={tab}>
        {tab === 'requests' && (
          <>
            <h2 className="list-title">For you</h2>
            {incoming.length ? (
              <ul className="loan-list">{incoming.map((l) => <LoanRow key={l.id} loan={l} />)}</ul>
            ) : (
              <p className="muted list-empty">No one is waiting on you. 👍</p>
            )}
            <h2 className="list-title">Sent by you</h2>
            {outgoing.length ? (
              <ul className="loan-list">{outgoing.map((l) => <LoanRow key={l.id} loan={l} />)}</ul>
            ) : (
              <p className="muted list-empty">
                You haven’t asked for anything. <Link to="/browse?availability=available">Browse available games →</Link>
              </p>
            )}
          </>
        )}
        {tab === 'lent' &&
          (lent.length ? (
            <ul className="loan-list">{[...lent].sort(byDue).map((l) => <LoanRow key={l.id} loan={l} />)}</ul>
          ) : (
            <EmptyState icon={<Gift size={40} />} title="Nothing lent out">
              When you lend a game, it shows up here with its due date.
            </EmptyState>
          ))}
        {tab === 'borrowed' &&
          (borrowed.length ? (
            <ul className="loan-list">{[...borrowed].sort(byDue).map((l) => <LoanRow key={l.id} loan={l} />)}</ul>
          ) : (
            <EmptyState
              icon={<Package size={40} />}
              title="You’re not borrowing anything"
              action={<Link to="/browse?availability=available" className="btn btn-primary">Find a game</Link>}
            />
          ))}
        {tab === 'history' &&
          (history.length ? (
            <ul className="loan-list">{history.map((l) => <LoanRow key={l.id} loan={l} showActions={false} />)}</ul>
          ) : (
            <EmptyState icon={<History size={40} />} title="No history yet" />
          ))}
      </div>
    </div>
  );
}
