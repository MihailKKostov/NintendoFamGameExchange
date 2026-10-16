import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Copy, Mail, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { Field, Modal, PageLoader, Spinner, Toggle } from '../components/ui';
import { appBaseUrl, config } from '../config';
import { displayName, formatDate } from '../lib/format';
import { useAuth } from '../state/auth';
import { useAction, useFamily } from '../state/data';
import { useToast } from '../state/toast';

export function Admin() {
  const { isAdmin, session } = useAuth();
  const family = useFamily();
  const toast = useToast();
  const { run, busy } = useAction();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  if (!isAdmin) return <Navigate to="/members" replace />;
  if (family.loading) return <PageLoader />;

  const profileByEmail = new Map(family.profiles.map((p) => [p.email, p]));
  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await run(() => api.addInvite(email, asAdmin, note), {
      emails: true,
      success: config.demo ? `${email} invited (demo — no email sent).` : `${email} is invited! We’ve emailed them a link.`,
    });
    if (res.ok) {
      setEmail('');
      setNote('');
      setAsAdmin(false);
    }
  };

  return (
    <div className="page">
      <Link to="/members" className="btn btn-ghost back-btn">
        <ArrowLeft size={18} /> Family
      </Link>
      <header className="page-head">
        <div>
          <h1>Invites</h1>
          <p className="muted">Only these email addresses can sign in and see the family library.</p>
        </div>
      </header>

      <section className="panel">
        <h2 className="panel-title">Invite someone</h2>
        <form className="invite-form" onSubmit={invite}>
          <Field label="Email address">
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cousin@example.com" />
          </Field>
          <Field label="Note (optional)" hint="Shown in the invite email, e.g. who they are.">
            <input className="input" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cousin Sam" />
          </Field>
          <Toggle checked={asAdmin} onChange={setAsAdmin} label="Make them an admin" description="Admins can invite and remove people." />
          <div className="row gap wrap end">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(appBaseUrl());
                toast.success('Link copied — invited people sign in with their email.');
              }}
            >
              <Copy size={18} /> Copy site link
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !email}>
              {busy ? <Spinner size={18} /> : <UserPlus size={18} />} Send invite
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel-title">
          Invited <span className="muted">({family.invites.length})</span>
        </h2>
        <ul className="invite-list">
          {[...family.invites]
            .sort((a, b) => a.email.localeCompare(b.email))
            .map((i) => {
              const p = profileByEmail.get(i.email);
              const self = i.email === session?.email;
              return (
                <li key={i.email} className="invite-row">
                  {p ? (
                    <Avatar profile={p} size={44} />
                  ) : (
                    <span className="avatar ring" style={{ width: 44, height: 44, background: 'var(--surface-3)' }}>
                      <Mail size={18} />
                    </span>
                  )}
                  <span className="invite-main">
                    <b>{p ? displayName(p) : i.note || i.email}</b>
                    <span className="muted small">
                      {i.email} · {p ? `joined ${formatDate(p.created_at)}` : `invited ${formatDate(i.created_at)} · not joined yet`}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={`chip${i.is_admin ? ' on' : ''}`}
                    disabled={self}
                    title={self ? 'You can’t change your own role' : 'Toggle admin'}
                    onClick={() => run(() => api.setInviteAdmin(i.email, !i.is_admin), { success: i.is_admin ? 'No longer an admin.' : 'Now an admin.' })}
                  >
                    <ShieldCheck size={14} /> Admin
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${i.email}`}
                    disabled={self}
                    onClick={() => setRemoving(i.email)}
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              );
            })}
        </ul>
      </section>

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove access?"
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
                const r = await run(() => api.removeInvite(removing!), { success: 'Access removed.' });
                if (r.ok) setRemoving(null);
              }}
            >
              <Trash2 size={18} /> Remove
            </button>
          </>
        }
      >
        <p>
          <b>{removing}</b> will no longer be able to sign in or see the family library. Their games and loan history stay
          visible to everyone else.
        </p>
      </Modal>
    </div>
  );
}
