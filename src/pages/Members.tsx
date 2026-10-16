import { Link } from 'react-router-dom';
import { Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { GameIcon } from '../components/GameIcon';
import { PageLoader } from '../components/ui';
import { displayName } from '../lib/format';
import { useAuth } from '../state/auth';
import { useFamily } from '../state/data';

export function Members() {
  const family = useFamily();
  const { isAdmin } = useAuth();
  if (family.loading) return <PageLoader />;

  const joinedEmails = new Set(family.profiles.map((p) => p.email));
  const pendingInvites = family.invites.filter((i) => !joinedEmails.has(i.email));
  const adminEmails = new Set(family.invites.filter((i) => i.is_admin).map((i) => i.email));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Family</h1>
          <p className="muted">Everyone who shares games here. Tap someone to see their library.</p>
        </div>
        {isAdmin && (
          <Link to="/admin" className="btn btn-primary">
            <UserPlus size={20} /> Invite people
          </Link>
        )}
      </header>

      <div className="member-grid">
        {family.members.map((m) => {
          const items = family.items.filter((i) => i.owner_id === m.id);
          const lent = family.loans.filter((l) => l.lender_id === m.id && l.status === 'active').length;
          const borrowed = family.loans.filter((l) => l.borrower_id === m.id && l.status === 'active').length;
          const icons = items.slice(0, 4).map((i) => family.gameById.get(i.game_id)).filter(Boolean);
          return (
            <Link key={m.id} to={`/members/${m.id}`} className="member-card" style={{ ['--accent' as string]: m.accent_color }}>
              <span className="member-card-band" />
              <Avatar profile={m} size={84} />
              <span className="member-card-name">
                {displayName(m)}
                {adminEmails.has(m.email) && <ShieldCheck size={16} className="admin-badge" aria-label="Admin" />}
              </span>
              {m.nickname && m.nickname !== m.display_name && <span className="muted small">{m.display_name}</span>}
              {m.id === family.meId && <span className="pill pill-neutral">You</span>}
              <span className="member-stats">
                <span><b>{items.length}</b> games</span>
                <span><b>{lent}</b> lent</span>
                <span><b>{borrowed}</b> borrowed</span>
              </span>
              <span className="member-icons">
                {icons.map((g) => (
                  <GameIcon key={g!.id} game={g!} size={44} />
                ))}
              </span>
            </Link>
          );
        })}
      </div>

      {pendingInvites.length > 0 && (
        <section className="section">
          <h2 className="list-title">Invited, not joined yet</h2>
          <ul className="invite-pending">
            {pendingInvites.map((i) => (
              <li key={i.email}>
                <span className="avatar ring" style={{ width: 40, height: 40, background: 'var(--surface-3)' }}>
                  <Mail size={18} />
                </span>
                <span>
                  <b>{i.note || i.email}</b>
                  {i.note && <span className="muted small"> · {i.email}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
