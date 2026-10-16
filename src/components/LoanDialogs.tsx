import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CalendarDays, Check, Gift, Send, Trash2, Undo2 } from 'lucide-react';
import { api } from '../api';
import { config } from '../config';
import { dateInputValue, displayName } from '../lib/format';
import { play } from '../lib/sounds';
import { useAction, useFamily } from '../state/data';
import type { Game, GameCondition, GameFormat, LibraryItem, Loan, Profile } from '../types';
import { Avatar } from './Avatar';
import { GameIcon } from './GameIcon';
import { Field, Modal, Segmented, Spinner, Toggle } from './ui';

const emailNote = (who: string) => (config.demo ? '' : `${who} will be notified.`);

function DuePicker({ due, setDue }: { due: string; setDue: (d: string) => void }) {
  const presets: [string, number][] = [['1 week', 7], ['2 weeks', 14], ['1 month', 30]];
  return (
    <Field label="Return by" hint="Optional — leave empty for no due date.">
      <div className="row gap wrap">
        <input className="input input-date" type="date" min={dateInputValue(0)} value={due} onChange={(e) => setDue(e.target.value)} />
        {presets.map(([label, days]) => (
          <button key={label} type="button" className={`chip${due === dateInputValue(days) ? ' on' : ''}`} onClick={() => setDue(dateInputValue(days))}>
            {label}
          </button>
        ))}
        {due && (
          <button type="button" className="chip" onClick={() => setDue('')}>
            No date
          </button>
        )}
      </div>
    </Field>
  );
}

function GameStrip({ game, children }: { game: Game; children?: React.ReactNode }) {
  return (
    <div className="game-strip">
      <GameIcon game={game} size={64} />
      <div>
        <b>{game.title}</b>
        {children}
      </div>
    </div>
  );
}

export function RequestDialog({
  open, onClose, item, game, owner,
}: { open: boolean; onClose: () => void; item: LibraryItem; game: Game; owner?: Profile }) {
  const { run, busy } = useAction();
  const navigate = useNavigate();
  const family = useFamily();
  const ownerName = displayName(owner);
  const [message, setMessage] = useState('');
  const activeLoan = family.loans.find((l) => l.item_id === item.id && l.status === 'active');

  useEffect(() => {
    if (open) setMessage(`Hi ${ownerName}! Could I borrow ${game.title}? 🙏`);
  }, [open, ownerName, game.title]);

  const submit = async () => {
    const res = await run(() => api.requestLoan(item.id, message), {
      success: `Request sent! ${emailNote(ownerName)}`,
    });
    if (res.ok) {
      onClose();
      if (res.value) navigate(`/loans/${res.value}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request to borrow"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner size={18} /> : <Send size={18} />} Send request
          </button>
        </>
      }
    >
      <GameStrip game={game}>
        <span className="row gap-s muted small">
          <Avatar profile={owner} size={22} /> {ownerName}’s {item.format === 'digital' ? 'digital copy' : 'game card'}
        </span>
      </GameStrip>
      {activeLoan && (
        <p className="notice notice-cyan">
          This copy is currently lent to {displayName(family.profileById.get(activeLoan.borrower_id))}. Your request will wait
          until it’s returned.
        </p>
      )}
      {item.notes && <p className="notice">📝 {item.notes}</p>}
      <Field label="Message">
        <textarea className="input" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function RespondDialog({
  open, onClose, loan, accept,
}: { open: boolean; onClose: () => void; loan: Loan; accept: boolean }) {
  const { run, busy } = useAction();
  const family = useFamily();
  const borrower = family.profileById.get(loan.borrower_id);
  const game = family.gameById.get(loan.game_id);
  const [message, setMessage] = useState('');
  const [due, setDue] = useState('');

  useEffect(() => {
    if (open) {
      setMessage(accept ? 'Sure, enjoy! 🎮' : '');
      setDue(accept ? dateInputValue(14) : '');
    }
  }, [open, accept]);

  const submit = async () => {
    const res = await run(() => api.respondToLoan(loan.id, accept, message, accept ? due || null : null), {
      success: accept ? `Accepted! ${emailNote(displayName(borrower))}` : 'Request declined.',
    });
    if (res.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={accept ? 'Accept request' : 'Decline request'}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Back
          </button>
          <button type="button" className={`btn ${accept ? 'btn-green' : 'btn-dark'}`} onClick={submit} disabled={busy}>
            {busy ? <Spinner size={18} /> : accept ? <Check size={18} /> : <Ban size={18} />} {accept ? 'Lend it' : 'Decline'}
          </button>
        </>
      }
    >
      {game && (
        <GameStrip game={game}>
          <span className="row gap-s muted small">
            <Avatar profile={borrower} size={22} /> requested by {displayName(borrower)}
          </span>
        </GameStrip>
      )}
      {accept && <DuePicker due={due} setDue={setDue} />}
      <Field label={accept ? 'Message (optional)' : 'Reason (optional)'}>
        <textarea
          className="input"
          rows={3}
          maxLength={1000}
          value={message}
          placeholder={accept ? '' : 'e.g. I’m playing it right now — ask me next month!'}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

export function LendDialog({ open, onClose, item }: { open: boolean; onClose: () => void; item: LibraryItem }) {
  const family = useFamily();
  const { run, busy } = useAction();
  const navigate = useNavigate();
  const game = family.gameById.get(item.game_id);
  const others = family.members.filter((m) => m.id !== family.meId);
  const requesters = new Set(family.loans.filter((l) => l.item_id === item.id && l.status === 'pending').map((l) => l.borrower_id));
  const [to, setTo] = useState('');
  const [due, setDue] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) {
      setTo([...requesters][0] ?? '');
      setDue(dateInputValue(14));
      setMessage('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    const borrower = family.profileById.get(to);
    const res = await run(() => api.lendGame(item.id, to, due || null, message), {
      success: `Lent to ${displayName(borrower)}! ${emailNote(displayName(borrower))}`,
    });
    if (res.ok) {
      onClose();
      if (res.value) navigate(`/loans/${res.value}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lend this game"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!to || busy}>
            {busy ? <Spinner size={18} /> : <Gift size={18} />} Lend
          </button>
        </>
      }
    >
      {game && <GameStrip game={game} />}
      <Field label="Who is borrowing it?">
        <div className="person-picker" role="radiogroup">
          {others.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={to === m.id}
              className={`person${to === m.id ? ' on' : ''}`}
              onClick={() => {
                play('tick');
                setTo(m.id);
              }}
            >
              <Avatar profile={m} size={48} />
              <span>{displayName(m)}</span>
              {requesters.has(m.id) && <span className="person-tag">asked</span>}
            </button>
          ))}
          {others.length === 0 && <p className="muted">Invite more family members first.</p>}
        </div>
      </Field>
      <DuePicker due={due} setDue={setDue} />
      <Field label="Message (optional)">
        <input className="input" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Have fun!" />
      </Field>
    </Modal>
  );
}

export function ReturnDialog({ open, onClose, loan }: { open: boolean; onClose: () => void; loan: Loan }) {
  const { run, busy } = useAction();
  const family = useFamily();
  const iAmLender = loan.lender_id === family.meId;
  const other = family.profileById.get(iAmLender ? loan.borrower_id : loan.lender_id);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (open) setMessage(iAmLender ? 'Got it back, thanks!' : 'Thanks for lending it to me!');
  }, [open, iAmLender]);

  const submit = async () => {
    const res = await run(() => api.markReturned(loan.id, message), { success: 'Marked as returned. 📦' });
    if (res.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as returned"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Back
          </button>
          <button type="button" className="btn btn-green" onClick={submit} disabled={busy}>
            {busy ? <Spinner size={18} /> : <Undo2 size={18} />} Returned
          </button>
        </>
      }
    >
      <p>
        {iAmLender
          ? `Confirm that ${displayName(other)} gave the game back.`
          : `Let ${displayName(other)} know you gave the game back.`}
      </p>
      <Field label="Message (optional)">
        <input className="input" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function DueDialog({ open, onClose, loan }: { open: boolean; onClose: () => void; loan: Loan }) {
  const { run, busy } = useAction();
  const [due, setDue] = useState(loan.due_at ?? '');
  useEffect(() => {
    if (open) setDue(loan.due_at ?? '');
  }, [open, loan.due_at]);
  const submit = async () => {
    const res = await run(() => api.setLoanDue(loan.id, due || null), { success: 'Due date updated.' });
    if (res.ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change due date"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Back
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            <CalendarDays size={18} /> Save
          </button>
        </>
      }
    >
      <DuePicker due={due} setDue={setDue} />
    </Modal>
  );
}

const CONDITIONS: { value: GameCondition | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'mint', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'worn', label: 'Well loved' },
];

export const conditionLabel = (c: GameCondition | null) => CONDITIONS.find((x) => x.value === c)?.label ?? null;

export function ItemDialog({ open, onClose, item }: { open: boolean; onClose: () => void; item: LibraryItem }) {
  const family = useFamily();
  const { run, busy } = useAction();
  const game = family.gameById.get(item.game_id);
  const [format, setFormat] = useState<GameFormat>(item.format);
  const [condition, setCondition] = useState<GameCondition | ''>(item.condition ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [lendable, setLendable] = useState(item.lendable);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setFormat(item.format);
      setCondition(item.condition ?? '');
      setNotes(item.notes ?? '');
      setLendable(item.lendable);
      setConfirmDelete(false);
    }
  }, [open, item]);

  const save = async () => {
    const res = await run(
      () => api.updateLibraryItem(item.id, { format, condition: format === 'physical' ? condition || null : null, notes: notes.trim() || null, lendable }),
      { success: 'Saved!' },
    );
    if (res.ok) onClose();
  };
  const remove = async () => {
    const res = await run(() => api.removeLibraryItem(item.id), { success: 'Removed from your library.' });
    if (res.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit your copy"
      size="sm"
      footer={
        confirmDelete ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
              <Trash2 size={18} /> Remove
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={18} /> Remove
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              <Check size={18} /> Save
            </button>
          </>
        )
      }
    >
      {game && <GameStrip game={game} />}
      {confirmDelete ? (
        <p className="notice notice-red">Remove {game?.title} from your library? Open requests for it will be cancelled.</p>
      ) : (
        <>
          <Toggle checked={lendable} onChange={setLendable} label="Available to lend" description="Turn off to keep it on your shelf without accepting requests." />
          <Field label="Format">
            <Segmented
              label="Format"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'physical', label: 'Game card' },
                { value: 'digital', label: 'Digital' },
              ]}
            />
          </Field>
          {format === 'physical' && (
            <Field label="Condition">
              <select className="input" value={condition} onChange={(e) => setCondition(e.target.value as GameCondition | '')}>
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Notes for borrowers">
            <input className="input" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </>
      )}
    </Modal>
  );
}
