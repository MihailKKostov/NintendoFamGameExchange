import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, LogOut, Mail, Plus, X } from 'lucide-react';
import { api } from '../api';
import { DemoBanner, FamilyBadge, Topbar } from '../components/Layout';
import { Field, PageLoader, Spinner } from '../components/ui';
import { config } from '../config';
import { displayName } from '../lib/format';
import { play } from '../lib/sounds';
import { useAuth } from '../state/auth';
import { useAction } from '../state/data';
import { useFamilies } from '../state/families';
import type { Invite } from '../types';

export const FAMILY_EMOJIS = ['🏠', '🎮', '🍄', '⭐', '🌴', '🏰', '🦊', '🐢', '🚀', '🌈', '🎲', '👾', '🌸', '🐙', '🔥', '🍕'];
export const FAMILY_COLORS = ['#e60012', '#ff8c00', '#ffb000', '#1aa34a', '#00b894', '#0ab9e6', '#1f6feb', '#8b3cf7', '#d6249f', '#545454'];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      {config.demo && <DemoBanner />}
      <Topbar />
      <main className="main">
        <div className="page page-narrow">{children}</div>
      </main>
    </div>
  );
}

export function FamilyLook({
  emoji, setEmoji, color, setColor,
}: { emoji: string; setEmoji: (e: string) => void; color: string; setColor: (c: string) => void }) {
  return (
    <>
      <Field label="Icon">
        <div className="icon-grid" role="radiogroup" aria-label="Family icon">
          {FAMILY_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={emoji === e}
              className={`icon-choice${emoji === e ? ' on' : ''}`}
              style={{ background: emoji === e ? color : undefined }}
              onClick={() => {
                play('tick');
                setEmoji(e);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Colour">
        <div className="color-row" role="radiogroup" aria-label="Family colour">
          {FAMILY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              className={`color-choice${color === c ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => {
                play('tick');
                setColor(c);
              }}
            >
              {color === c && <Check size={16} />}
            </button>
          ))}
        </div>
      </Field>
    </>
  );
}

function InviteCard({ invite }: { invite: Invite }) {
  const { switchFamily } = useFamilies();
  const navigate = useNavigate();
  const { run, busy } = useAction();
  return (
    <li className="invite-card">
      <FamilyBadge emoji={invite.family_emoji ?? '🏠'} color="#0ab9e6" size={52} />
      <div className="invite-card-text">
        <b>{invite.family_name}</b>
        <span className="muted small">
          {invite.invited_by_name} invited you{invite.role === 'admin' ? ' as an admin' : ''}
        </span>
      </div>
      <div className="row gap-s">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={async () => {
            const r = await run(() => api.acceptInvite(invite.id), { success: `Welcome to ${invite.family_name}! 🎉` });
            if (r.ok && r.value) {
              switchFamily(r.value);
              navigate('/');
            }
          }}
        >
          {busy ? <Spinner size={16} /> : <Check size={16} />} Join
        </button>
        <button type="button" className="icon-btn" aria-label="Decline invite" disabled={busy} onClick={() => run(() => api.declineInvite(invite.id))}>
          <X size={18} />
        </button>
      </div>
    </li>
  );
}

/** Shown when you have no family yet, and at #/families/new. */
export function Onboarding() {
  const { families, invites, me, current, switchFamily } = useFamilies();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { run, busy } = useAction();
  const [name, setName] = useState(() => (me?.display_name ? `${me.display_name.split(' ').slice(-1)[0]} Family` : 'Our Family'));
  const [emoji, setEmoji] = useState('🏠');
  const [color, setColor] = useState('#e60012');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => api.createFamily({ name: name.trim(), emoji, color }), { success: `${name.trim()} is ready! Invite your family next.` });
    if (r.ok && r.value) {
      switchFamily(r.value);
      navigate('/family');
    }
  };

  return (
    <Shell>
      <header className="page-head">
        <div>
          <h1>{families.length ? 'Create or join a family' : `Hi ${displayName(me)}! 👋`}</h1>
          <p className="muted">
            {families.length
              ? 'You can be part of several families — switch between them from the top bar.'
              : 'Families share their game libraries with each other. Join one you’ve been invited to, or start your own.'}
          </p>
        </div>
        {current && (
          <Link to="/" className="btn btn-secondary">
            Back to {current.name}
          </Link>
        )}
      </header>

      {invites.length > 0 && (
        <section className="panel">
          <h2 className="panel-title">
            <Mail size={20} /> You’re invited
          </h2>
          <ul className="invite-cards">
            {invites.map((i) => (
              <InviteCard key={i.id} invite={i} />
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2 className="panel-title">
          <Plus size={20} /> Start a new family
        </h2>
        <form onSubmit={create} className="create-family">
          <div className="create-family-preview" style={{ ['--accent' as string]: color }}>
            <FamilyBadge emoji={emoji} color={color} size={72} />
            <b>{name.trim() || 'Your family'}</b>
            <span className="muted small">You’ll be the owner and can invite people by email.</span>
          </div>
          <div>
            <Field label="Family name">
              <input className="input" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <FamilyLook emoji={emoji} setEmoji={setEmoji} color={color} setColor={setColor} />
            <div className="row end">
              <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
                {busy ? <Spinner size={18} /> : <Plus size={18} />} Create family
              </button>
            </div>
          </div>
        </form>
      </section>

      {!families.length && (
        <p className="muted small center">
          Expecting an invite? Ask a family admin to invite <b>{me?.email}</b>, then refresh this page.{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
            <LogOut size={14} /> Sign out
          </button>
        </p>
      )}
    </Shell>
  );
}

/** #/join/:inviteId — the link in invite emails. */
export function JoinPage() {
  const { inviteId = '' } = useParams();
  const { session, signOut } = useAuth();
  const { families, switchFamily } = useFamilies();
  const navigate = useNavigate();
  const { run, busy } = useAction();
  const invite = useQuery({ queryKey: ['invite', inviteId, session?.userId], queryFn: () => api.getInvite(inviteId) });

  if (invite.isLoading) return <PageLoader />;
  const inv = invite.data;
  const alreadyIn = inv && families.some((f) => f.id === inv.family_id);

  return (
    <Shell>
      <section className="panel join-panel">
        {!inv ? (
          <>
            <h1>Invite not found</h1>
            <p className="muted">
              This invite isn’t addressed to <b>{session?.email}</b>, or it was cancelled. If it was sent to a different email address, sign
              out and sign in with that one.
            </p>
            <div className="row gap wrap center">
              <button type="button" className="btn btn-secondary" onClick={signOut}>
                <LogOut size={18} /> Sign out
              </button>
              <Link to="/" className="btn btn-primary">
                Continue
              </Link>
            </div>
          </>
        ) : alreadyIn ? (
          <>
            <FamilyBadge emoji={inv.family_emoji ?? '🏠'} color="#0ab9e6" size={84} />
            <h1>You’re already in {inv.family_name}</h1>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => {
                switchFamily(inv.family_id);
                navigate('/');
              }}
            >
              Open {inv.family_name}
            </button>
          </>
        ) : inv.status !== 'pending' ? (
          <>
            <h1>This invite is no longer valid</h1>
            <p className="muted">Ask {inv.invited_by_name} to send a new one.</p>
            <Link to="/" className="btn btn-primary">
              Continue
            </Link>
          </>
        ) : (
          <>
            <FamilyBadge emoji={inv.family_emoji ?? '🏠'} color="#0ab9e6" size={84} />
            <h1>Join {inv.family_name}?</h1>
            <p className="muted">
              {inv.invited_by_name} invited you to share Nintendo games{inv.role === 'admin' ? ' as an admin' : ''}.
            </p>
            <div className="row gap wrap center">
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                disabled={busy}
                onClick={async () => {
                  const r = await run(() => api.declineInvite(inv.id));
                  if (r.ok) navigate('/');
                }}
              >
                No thanks
              </button>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={busy}
                onClick={async () => {
                  const r = await run(() => api.acceptInvite(inv.id), { success: `Welcome to ${inv.family_name}! 🎉` });
                  if (r.ok && r.value) {
                    switchFamily(r.value);
                    navigate('/');
                  }
                }}
              >
                {busy ? <Spinner size={20} /> : <Check size={20} />} Join family
              </button>
            </div>
          </>
        )}
      </section>
    </Shell>
  );
}
