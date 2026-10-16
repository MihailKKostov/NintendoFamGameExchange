import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Bell, CheckCheck, Gamepad2, House, LayoutGrid, RotateCcw, Settings, Users } from 'lucide-react';
import { api } from '../api';
import { resetDemo } from '../api/demoApi';
import { config } from '../config';
import { daysUntil, displayName, timeAgo } from '../lib/format';
import { play } from '../lib/sounds';
import { useAuth } from '../state/auth';
import { qk, useAction, useFamily, useNotifications } from '../state/data';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { notificationText } from './notificationText';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time className="topbar-clock" dateTime={now.toISOString()}>
      {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
    </time>
  );
}

function NotificationsMenu() {
  const { data = [] } = useNotifications();
  const family = useFamily();
  const navigate = useNavigate();
  const { run } = useAction();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = data.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const loanGame = (loanId: string | null) => {
    const loan = family.loans.find((l) => l.id === loanId);
    return loan ? family.gameById.get(loan.game_id) : undefined;
  };

  return (
    <div className="notif" ref={ref}>
      <button
        type="button"
        className={`icon-btn${open ? ' active' : ''}`}
        aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-expanded={open}
        onClick={() => {
          play(open ? 'back' : 'pop');
          setOpen(!open);
        }}
      >
        <Bell size={22} />
        {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <h3>Notifications</h3>
            {unread > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(() => api.markNotificationsRead())}>
                <CheckCheck size={16} /> Mark all read
              </button>
            )}
          </div>
          {data.length === 0 ? (
            <p className="notif-empty">You're all caught up! 🎉</p>
          ) : (
            <ul className="notif-list">
              {data.slice(0, 30).map((n) => {
                const actor = family.profileById.get(n.actor_id ?? '');
                const game = loanGame(n.loan_id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`notif-item${n.read_at ? '' : ' unread'}`}
                      onClick={() => {
                        setOpen(false);
                        if (!n.read_at) void api.markNotificationsRead([n.id]).then(() => qc.invalidateQueries({ queryKey: qk.notifications }));
                        if (n.loan_id) navigate(`/loans/${n.loan_id}`);
                      }}
                    >
                      <Avatar profile={actor} size={38} />
                      <span className="notif-text">
                        <span>{notificationText(n.kind, displayName(actor), game?.title ?? 'a game')}</span>
                        {n.body && <span className="notif-body">“{n.body}”</span>}
                        <span className="notif-time">{timeAgo(n.created_at)}</span>
                      </span>
                      {!n.read_at && <i className="notif-dot" aria-label="unread" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function DemoBanner() {
  const family = useFamily();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <div className="demo-banner" role="note">
      <span className="demo-tag">DEMO</span>
      <span className="demo-text">Sample data stored only in this browser. Try switching person to test lending:</span>
      <select
        aria-label="Switch person"
        value={family.me?.email ?? ''}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          await api.verifyLoginCode(e.target.value, '000000');
          await refresh();
          setBusy(false);
          play('select');
        }}
      >
        {family.members.map((m) => (
          <option key={m.id} value={m.email}>
            {displayName(m)} ({m.email})
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-ghost btn-sm" onClick={resetDemo}>
        <RotateCcw size={14} /> Reset
      </button>
    </div>
  );
}

export function Layout() {
  const family = useFamily();
  const location = useLocation();
  const meId = family.meId;

  const loanBadge = useMemo(
    () =>
      family.loans.filter(
        (l) =>
          (l.lender_id === meId && l.status === 'pending') ||
          (l.borrower_id === meId && l.status === 'active' && l.due_at && daysUntil(l.due_at) < 0),
      ).length,
    [family.loans, meId],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  const nav = [
    { to: '/', label: 'Home', icon: <House size={24} />, end: true },
    { to: '/browse', label: 'Browse', icon: <LayoutGrid size={24} /> },
    { to: '/library', label: 'My Games', icon: <Gamepad2 size={24} /> },
    { to: '/loans', label: 'Loans', icon: <ArrowLeftRight size={24} />, badge: loanBadge },
    { to: '/members', label: 'Family', icon: <Users size={24} /> },
    { to: '/settings', label: 'Settings', icon: <Settings size={24} /> },
  ];

  return (
    <div className="shell">
      {config.demo && <DemoBanner />}
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="topbar-logo" aria-label="Home">
            <Logo size="sm" />
          </Link>
          <div className="topbar-right">
            <Clock />
            <NotificationsMenu />
            <Link to="/settings" className="topbar-me" aria-label="Your profile">
              <Avatar profile={family.me} size={40} />
            </Link>
          </div>
        </div>
      </header>

      <main className="main" key={location.pathname}>
        <Outlet />
      </main>

      <nav className="dock" aria-label="Main">
        <div className="dock-inner">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="dock-btn">
              <span className="dock-circle">
                {n.icon}
                {!!n.badge && <span className="badge">{n.badge}</span>}
              </span>
              <span className="dock-label">{n.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
