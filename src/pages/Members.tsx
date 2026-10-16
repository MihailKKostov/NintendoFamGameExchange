import { Link } from 'react-router-dom';
import { Crown, Mail, Settings2, ShieldCheck, UserPlus } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { GameIcon } from '../components/GameIcon';
import { PageLoader } from '../components/ui';
import { displayName } from '../lib/format';
import { useFamily, useFamilyInvites } from '../state/data';
import { useFamilies } from '../state/families';

export function Members() {
  const family = useFamily();
  const { current, isAdmin } = useFamilies();
  const invites = useFamilyInvites(isAdmin);
  if (family.loading || !current) return <PageLoader />;
  const pendingInvites = isAdmin ? invites.data ?? [] : [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{current.name}</h1>
          <p className="muted">Everyone who shares games here. Tap someone to see their library.</p>
        </div>
        <div className="row gap wrap">
          <Link to="/family" className="btn btn-secondary">
            <Settings2 size={20} /> Family settings
          </Link>
          {isAdmin && (
            <Link to="/family" className="btn btn-primary">
              <UserPlus size={20} /> Invite people
            </Link>
          )}
        </div>
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
                {m.id === current.owner_id ? (
                  <Crown size={16} className="admin-badge" aria-label="Owner" />
                ) : (
                  current.admin_ids.includes(m.id) && <ShieldCheck size={16} className="admin-badge" aria-label="Admin" />
                )}
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
                  <b>{i.email}</b>
                  <span className="muted small"> · invited by {i.invited_by_name}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
