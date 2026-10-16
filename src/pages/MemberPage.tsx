import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftRight, Copy, Gift, Package, Pencil } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { LibraryBrowser } from '../components/LibraryBrowser';
import { EmptyState, PageLoader } from '../components/ui';
import { displayName, formatDate } from '../lib/format';
import { buildEntries } from '../lib/library';
import { useFamily } from '../state/data';
import { useToast } from '../state/toast';
import { LoanRow } from './Loans';

export function MemberPage() {
  const { memberId = '' } = useParams();
  const family = useFamily();
  const toast = useToast();
  const person = family.profileById.get(memberId);
  const entries = useMemo(
    () => buildEntries(family.games, family.items.filter((i) => i.owner_id === memberId), family.loans, family.profileById, family.meId),
    [family, memberId],
  );

  if (family.loading) return <PageLoader />;
  if (!person) {
    return (
      <div className="page">
        <EmptyState title="Person not found" action={<Link to="/members" className="btn btn-primary">See the family</Link>} />
      </div>
    );
  }

  const isMe = person.id === family.meId;
  const between = family.loans.filter(
    (l) =>
      !isMe &&
      l.status === 'active' &&
      ((l.lender_id === person.id && l.borrower_id === family.meId) || (l.borrower_id === person.id && l.lender_id === family.meId)),
  );
  const lent = family.loans.filter((l) => l.lender_id === person.id && l.status === 'active').length;
  const borrowed = family.loans.filter((l) => l.borrower_id === person.id && l.status === 'active').length;
  const shared = family.loans.filter((l) => l.lender_id === person.id && ['active', 'returned'].includes(l.status)).length;

  return (
    <div className="page">
      <section className="profile-hero" style={{ ['--accent' as string]: person.accent_color }}>
        <div className="profile-hero-band" />
        <div className="profile-hero-content">
          <Avatar profile={person} size={120} />
          <div className="profile-hero-text">
            <h1>{displayName(person)}</h1>
            {person.nickname && person.nickname !== person.display_name && <p className="muted">{person.display_name}</p>}
            {person.bio && <p className="profile-bio">{person.bio}</p>}
            <div className="row gap wrap profile-meta">
              {person.friend_code && (
                <button
                  type="button"
                  className="tag tag-btn"
                  onClick={() => {
                    void navigator.clipboard?.writeText(person.friend_code!);
                    toast.success('Friend code copied!');
                  }}
                >
                  Friend code <b>{person.friend_code}</b> <Copy size={14} />
                </button>
              )}
              <span className="tag tag-soft">Joined {formatDate(person.created_at, { day: undefined })}</span>
            </div>
          </div>
          {isMe && (
            <Link to="/settings" className="btn btn-secondary profile-edit">
              <Pencil size={18} /> Edit profile
            </Link>
          )}
        </div>
        <div className="profile-stats">
          <div><b>{entries.length}</b><span>games</span></div>
          <div><Gift size={16} /><b>{lent}</b><span>lent out</span></div>
          <div><Package size={16} /><b>{borrowed}</b><span>borrowing</span></div>
          <div><ArrowLeftRight size={16} /><b>{shared}</b><span>times shared</span></div>
        </div>
      </section>

      {between.length > 0 && (
        <section className="section">
          <h2 className="list-title">Between you two</h2>
          <ul className="loan-list">
            {between.map((l) => (
              <LoanRow key={l.id} loan={l} />
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>{isMe ? 'Your library' : `${displayName(person)}’s library`}</h2>
        </div>
        <LibraryBrowser
          entries={entries}
          fixedOwner={person.id}
          emptyText={isMe ? 'Your library is empty' : `${displayName(person)} hasn’t added any games yet`}
        />
      </section>
    </div>
  );
}
