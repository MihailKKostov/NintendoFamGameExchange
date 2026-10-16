import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Crown, DoorOpen, Link2, Mail, ShieldCheck, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { FamilyBadge } from '../components/Layout';
import { Field, Modal, PageLoader, Spinner, Toggle } from '../components/ui';
import { appBaseUrl, config } from '../config';
import { displayName, formatDate, timeAgo } from '../lib/format';
import { useAction, useFamily, useFamilyInvites } from '../state/data';
import { useFamilies } from '../state/families';
import { useToast } from '../state/toast';
import type { Member } from '../types';
import { FamilyLook } from './Onboarding';

const inviteLink = (id: string) => `${appBaseUrl()}#/join/${id}`;

function copy(text: string, toast: ReturnType<typeof useToast>, what: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success(`${what} copied!`),
    () => toast.info(text),
  );
}

function FamilyProfile() {
  const { current, isAdmin } = useFamilies();
  const { run, busy } = useAction();
  const [name, setName] = useState(current!.name);
  const [emoji, setEmoji] = useState(current!.emoji);
  const [color, setColor] = useState(current!.color);
  useEffect(() => {
    setName(current!.name);
    setEmoji(current!.emoji);
    setColor(current!.color);
  }, [current]);
  const dirty = name !== current!.name || emoji !== current!.emoji || color !== current!.color;

  if (!isAdmin) {
    return (
      <section className="panel family-hero" style={{ ['--accent' as string]: current!.color }}>
        <FamilyBadge emoji={current!.emoji} color={current!.color} size={72} />
        <div>
          <h1>{current!.name}</h1>
          <p className="muted">
            {current!.member_ids.length} members · since {formatDate(current!.created_at, { day: undefined })}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="family-hero" style={{ ['--accent' as string]: color }}>
        <FamilyBadge emoji={emoji} color={color} size={72} />
        <div>
          <h1>{name.trim() || current!.name}</h1>
          <p className="muted">
            {current!.member_ids.length} members · since {formatDate(current!.created_at, { day: undefined })}
          </p>
        </div>
      </div>
      <Field label="Family name">
        <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <FamilyLook emoji={emoji} setEmoji={setEmoji} color={color} setColor={setColor} />
      <div className="row end">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || !name.trim() || busy}
          onClick={() => run(() => api.updateFamily({ name: name.trim(), emoji, color }), { success: 'Family updated!' })}
        >
          {busy ? <Spinner size={18} /> : <Check size={18} />} Save
        </button>
      </div>
    </section>
  );
}

function Members() {
  const family = useFamily();
  const { current, role } = useFamilies();
  const { run, busy } = useAction();
  const [removing, setRemoving] = useState<Member | null>(null);
  const isAdmin = role === 'owner' || role === 'admin';

  return (
    <section className="panel">
      <h2 className="panel-title">
        Members <span className="muted">({family.members.length})</span>
      </h2>
      <ul className="invite-list">
        {family.members.map((m) => {
          const mRole = m.id === current!.owner_id ? 'owner' : current!.admin_ids.includes(m.id) ? 'admin' : 'member';
          const self = m.id === family.meId;
          const canChange = isAdmin && mRole !== 'owner' && (role === 'owner' || mRole === 'member' || self);
          const canRemove = isAdmin && !self && mRole !== 'owner' && (role === 'owner' || mRole === 'member');
          return (
            <li key={m.id} className="invite-row">
              <Avatar profile={m} size={44} />
              <span className="invite-main">
                <b>
                  {displayName(m)}
                  {self && <span className="muted"> (you)</span>}
                </b>
                <span className="muted small">
                  {m.email} · joined {formatDate(m.joined_at, { day: undefined })}
                </span>
              </span>
              {mRole === 'owner' ? (
                <span className="pill pill-amber">
                  <Crown size={14} /> Owner
                </span>
              ) : canChange ? (
                <button
                  type="button"
                  className={`chip${mRole === 'admin' ? ' on' : ''}`}
                  disabled={busy}
                  title="Admins can invite and remove people"
                  onClick={() =>
                    run(() => api.setMemberRole(m.id, mRole === 'admin' ? 'member' : 'admin'), {
                      success: mRole === 'admin' ? `${displayName(m)} is no longer an admin.` : `${displayName(m)} is now an admin.`,
                    })
                  }
                >
                  <ShieldCheck size={14} /> {mRole === 'admin' ? 'Admin' : 'Make admin'}
                </button>
              ) : (
                mRole === 'admin' && (
                  <span className="pill pill-cyan">
                    <ShieldCheck size={14} /> Admin
                  </span>
                )
              )}
              {canRemove && (
                <button type="button" className="icon-btn" aria-label={`Remove ${displayName(m)}`} onClick={() => setRemoving(m)}>
                  <UserMinus size={18} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove from family?"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setRemoving(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={async () => {
                const r = await run(() => api.removeMember(removing!.id), { success: `${displayName(removing!)} was removed.` });
                if (r.ok) setRemoving(null);
              }}
            >
              <UserMinus size={18} /> Remove
            </button>
          </>
        }
      >
        <p>
          <b>{displayName(removing ?? undefined)}</b> will lose access to {current!.name}. Their games leave the family library and
          their open requests are cancelled. Loan history stays.
        </p>
      </Modal>
    </section>
  );
}

function Invites() {
  const { current } = useFamilies();
  const invites = useFamilyInvites();
  const toast = useToast();
  const { run, busy } = useAction();
  const [email, setEmail] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    const r = await run(() => api.inviteMember(addr, asAdmin ? 'admin' : 'member'), {
      success: config.demo ? `${addr} invited (demo — no email sent).` : `${addr} is invited! They’ll get an email with a link.`,
    });
    if (r.ok) {
      setEmail('');
      setAsAdmin(false);
    }
  };

  return (
    <section className="panel">
      <h2 className="panel-title">
        <UserPlus size={20} /> Invite people
      </h2>
      <p className="muted small bottom-gap">
        Invited people sign in with that exact email address, then join {current!.name}. You can also copy an invite link and send it in a
        message.
      </p>
      <form className="invite-form" onSubmit={invite}>
        <div className="invite-form-row">
          <div className="search-input">
            <Mail size={18} aria-hidden="true" />
            <input type="email" required aria-label="Email address" placeholder="cousin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>
            {busy ? <Spinner size={18} /> : <UserPlus size={18} />} Invite
          </button>
        </div>
        <Toggle checked={asAdmin} onChange={setAsAdmin} label="Make them an admin" description="Admins can invite and remove people." />
      </form>

      {(invites.data?.length ?? 0) > 0 && (
        <>
          <h3 className="list-title">Waiting to join</h3>
          <ul className="invite-list">
            {invites.data!.map((i) => (
              <li key={i.id} className="invite-row">
                <span className="avatar ring" style={{ width: 44, height: 44, background: 'var(--surface-3)' }}>
                  <Mail size={18} />
                </span>
                <span className="invite-main">
                  <b>{i.email}</b>
                  <span className="muted small">
                    {i.role === 'admin' ? 'Admin · ' : ''}invited by {i.invited_by_name} {timeAgo(i.created_at)}
                  </span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(inviteLink(i.id), toast, 'Invite link')}>
                  <Link2 size={16} /> <span className="hide-xs">Copy link</span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Cancel invite for ${i.email}`}
                  onClick={() => run(() => api.revokeInvite(i.id), { success: 'Invite cancelled.' })}
                >
                  <X size={18} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function DangerZone() {
  const { current, role } = useFamilies();
  const navigate = useNavigate();
  const { run, busy } = useAction();
  const [dialog, setDialog] = useState<null | 'leave' | 'delete'>(null);
  const [confirmName, setConfirmName] = useState('');
  const owner = role === 'owner';

  return (
    <section className="panel settings-list">
      <h2 className="panel-title">{owner ? 'Delete family' : 'Leave family'}</h2>
      <div className="setting">
        <span className="toggle-text">
          <span className="toggle-label">{owner ? `Delete ${current!.name}` : `Leave ${current!.name}`}</span>
          <span className="toggle-desc">
            {owner
              ? 'Permanently deletes the family, its library and all loan history for everyone.'
              : 'Your games leave this family’s library. You can be invited back later.'}
          </span>
        </span>
        <button type="button" className="btn btn-secondary btn-danger-text" onClick={() => setDialog(owner ? 'delete' : 'leave')}>
          {owner ? <Trash2 size={18} /> : <DoorOpen size={18} />} {owner ? 'Delete' : 'Leave'}
        </button>
      </div>
      <Modal
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog === 'delete' ? 'Delete this family?' : 'Leave this family?'}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || (dialog === 'delete' && confirmName.trim() !== current!.name)}
              onClick={async () => {
                const r = dialog === 'delete'
                  ? await run(() => api.deleteFamily(), { success: `${current!.name} was deleted.` })
                  : await run(() => api.leaveFamily(), { success: `You left ${current!.name}.` });
                if (r.ok) {
                  setDialog(null);
                  navigate('/');
                }
              }}
            >
              {busy ? <Spinner size={18} /> : dialog === 'delete' ? <Trash2 size={18} /> : <DoorOpen size={18} />}{' '}
              {dialog === 'delete' ? 'Delete forever' : 'Leave'}
            </button>
          </>
        }
      >
        {dialog === 'delete' ? (
          <>
            <p className="bottom-gap">This can’t be undone. Type the family name to confirm:</p>
            <input className="input" value={confirmName} placeholder={current!.name} onChange={(e) => setConfirmName(e.target.value)} />
          </>
        ) : (
          <p>You can only leave when you have no games lent out or borrowed in this family.</p>
        )}
      </Modal>
    </section>
  );
}

export function FamilySettings() {
  const family = useFamily();
  const { current, isAdmin } = useFamilies();
  const toast = useToast();
  if (family.loading || !current) return <PageLoader />;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Family settings</h1>
          <p className="muted">{isAdmin ? 'Manage who’s in the family and how it looks.' : 'Who’s in the family.'}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => copy(appBaseUrl(), toast, 'Site link')}>
          <Copy size={18} /> Copy site link
        </button>
      </header>
      <FamilyProfile />
      {isAdmin && <Invites />}
      <Members />
      <DangerZone />
    </div>
  );
}
