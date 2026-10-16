import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight, Bell, Check, CheckCheck, ChevronDown, Gamepad2, House, LayoutGrid, Plus, RotateCcw, Settings, Users,
  UserCog,
} from 'lucide-react';
import { api } from '../api';
import { resetDemo } from '../api/demoApi';
import { config } from '../config';
import { daysUntil, timeAgo } from '../lib/format';
import { play } from '../lib/sounds';
import { qk, useFamily, useNotifications } from '../state/data';
import { useFamilies } from '../state/families';
import { useAuth } from '../state/auth';
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

/** Small popover that closes on outside click / Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
  return { open, setOpen, ref };
}

export function FamilyBadge({ emoji, color, size = 36 }: { emoji: string; color: string; size?: number }) {
  return (
    <span className="family-badge" style={{ width: size, height: size, fontSize: size * 0.52, background: color }} aria-hidden="true">
      {emoji || '🏠'}
    </span>
  );
}

function FamilySwitcher() {
  const { families, current, switchFamily, isAdmin } = useFamilies();
  const navigate = useNavigate();
  const { open, setOpen, ref } = usePopover();
  if (!current) return null;
  return (
    <div className="famswitch" ref={ref}>
      <button
        type="button"
        className={`famswitch-btn${open ? ' active' : ''}`}
        aria-expanded={open}
        aria-label={`Family: ${current.name}. Switch family`}
        onClick={() => {
          play(open ? 'back' : 'pop');
          setOpen(!open);
        }}
      >
        <FamilyBadge emoji={current.emoji} color={current.color} size={30} />
        <span className="famswitch-name">{current.name}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="popover famswitch-panel" role="menu">
          <p className="popover-label">Your families</p>
          {families.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitemradio"
              aria-checked={f.id === current.id}
              className={`famswitch-item${f.id === current.id ? ' on' : ''}`}
              onClick={() => {
                setOpen(false);
                if (f.id !== current.id) {
                  switchFamily(f.id);
                  navigate('/');
                  play('select');
                }
              }}
            >
              <FamilyBadge emoji={f.emoji} color={f.color} size={34} />
              <span className="famswitch-item-text">
                <b>{f.name}</b>
                <span className="muted small">{f.member_ids.length} member{f.member_ids.length === 1 ? '' : 's'}</span>
              </span>
              {f.id === current.id && <Check size={18} className="famswitch-check" />}
            </button>
          ))}
          <div className="popover-sep" />
          <Link to="/family" className="famswitch-action" onClick={() => setOpen(false)}>
            <UserCog size={18} /> {isAdmin ? 'Family settings & invites' : 'Family settings'}
          </Link>
          <Link to="/families/new" className="famswitch-action" onClick={() => setOpen(false)}>
            <Plus size={18} /> Create or join a family
          </Link>
        </div>
      )}
    </div>
  );
}

function NotificationsMenu() {
  const { data = [] } = useNotifications();
  const { families, current, switchFamily } = useFamilies();
  const { session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { open, setOpen, ref } = usePopover();
  const unread = data.filter((n) => !n.read_at).length;
  const familyById = new Map(families.map((f) => [f.id, f]));
  const many = families.length > 1;
  const refresh = () => qc.invalidateQueries({ queryKey: qk.notifications(session?.userId ?? '') });

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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void api.markNotificationsRead().then(refresh)}>
                <CheckCheck size={16} /> Mark all read
              </button>
            )}
          </div>
          {data.length === 0 ? (
            <p className="notif-empty">You're all caught up! 🎉</p>
          ) : (
            <ul className="notif-list">
              {data.slice(0, 30).map((n) => {
                const fam = familyById.get(n.family_id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`notif-item${n.read_at ? '' : ' unread'}`}
                      onClick={() => {
                        setOpen(false);
                        if (!n.read_at) void api.markNotificationsRead([n.id]).then(refresh);
                        if (fam && fam.id !== current?.id) switchFamily(fam.id);
                        navigate(n.loan_id ? `/loans/${n.loan_id}` : n.kind === 'member_joined' ? '/members' : '/');
                      }}
                    >
                      {fam ? <FamilyBadge emoji={fam.emoji} color={fam.color} size={38} /> : <span className="family-badge" style={{ width: 38, height: 38 }} />}
                      <span className="notif-text">
                        <span>{notificationText(n.kind, n.actor_name ?? 'Someone', n.game_title ?? 'a game')}</span>
                        {n.body && <span className="notif-body">“{n.body}”</span>}
                        <span className="notif-time">
                          {many && fam ? `${fam.name} · ` : ''}
                          {timeAgo(n.created_at)}
                        </span>
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

const DEMO_PEOPLE = [
  ['maya@demo.family', 'Mom (Maya)'],
  ['alex@demo.family', 'Dad (Alex)'],
  ['leo@demo.family', 'Leo'],
  ['zoe@demo.family', 'Auntie Zo'],
];

export function DemoBanner() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const known = DEMO_PEOPLE.some(([e]) => e === session?.email);
  return (
    <div className="demo-banner" role="note">
      <span className="demo-tag">DEMO</span>
      <span className="demo-text">Sample data stored only in this browser. Switch person to test lending:</span>
      <select
        aria-label="Switch person"
        value={session?.email ?? ''}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          await api.sendLoginLink(e.target.value);
          setBusy(false);
          play('select');
        }}
      >
        {!known && session && <option value={session.email}>{session.email}</option>}
        {DEMO_PEOPLE.map(([email, label]) => (
          <option key={email} value={email}>
            {label} ({email})
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-ghost btn-sm" onClick={resetDemo}>
        <RotateCcw size={14} /> Reset
      </button>
    </div>
  );
}

export function Topbar({ children }: { children?: ReactNode }) {
  const { me } = useFamilies();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <Link to="/" className="topbar-logo" aria-label="Home">
            <Logo size="sm" />
          </Link>
          {children}
        </div>
        <div className="topbar-right">
          <Clock />
          <NotificationsMenu />
          <Link to="/settings" className="topbar-me" aria-label="Your profile">
            <Avatar profile={me} size={40} />
          </Link>
        </div>
      </div>
    </header>
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
      <Topbar>
        <FamilySwitcher />
      </Topbar>

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
