/*
 * Demo backend: the whole app running in the browser with sample data kept in
 * localStorage. Used automatically when no Firebase config is set, so the site
 * can be previewed (and tested) before the backend exists. The rules mirror
 * the Cloud Functions in functions/src.
 */
import type {
  AppNotification, Family, Game, GameInput, Invite, LibraryItem, Loan, LoanEvent, LoanEventKind, Member, Profile,
  Role, Session,
} from '../types';
import seedGames from './demoSeed.json';
import type { Api, Table } from './types';

const STORE_KEY = 'fge-demo-v2';
const SESSION_KEY = 'fge-demo-session-v2';

type Scoped<T> = T & { family_id: string };
type DemoUser = Profile & { family_ids: string[] };

interface DemoState {
  users: DemoUser[];
  families: Family[];
  members: Scoped<Member>[];
  games: Scoped<Game>[];
  library: Scoped<LibraryItem>[];
  loans: Scoped<Loan>[];
  events: Scoped<LoanEvent>[];
  notifications: (AppNotification & { user_id: string })[];
  invites: Invite[];
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const dateIn = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const nameOf = (p?: Pick<Profile, 'nickname' | 'display_name'>) => (p ? p.nickname?.trim() || p.display_name : 'Someone');

function seed(): DemoState {
  const people: [string, string, string, string, string, string | null, string][] = [
    ['p-maya', 'maya@demo.family', 'Maya Rivers', 'Mom', '🌸', 'Cozy games only. Will trade Animal Crossing turnips for cookies.', '#e60012'],
    ['p-alex', 'alex@demo.family', 'Alex Rivers', 'Dad', '🐢', 'Kart champion of 2019 (disputed).', '#0ab9e6'],
    ['p-leo', 'leo@demo.family', 'Leo Rivers', 'Leo', '👾', 'Speedrunning everything. Please return my Metroid.', '#1edc00'],
    ['p-zoe', 'zoe@demo.family', 'Zoe Chen', 'Auntie Zo', '🦊', 'Party game hoarder. Ask me for Mario Party!', '#b400e6'],
  ];
  const users: DemoUser[] = people.map(([id, email, display_name, nickname, avatar_icon, bio, accent_color], i) => ({
    id, email, display_name, nickname, avatar_icon, bio, accent_color, avatar_url: null,
    friend_code: i === 0 ? 'SW-1234-5678-9012' : i === 2 ? 'SW-4821-0093-7715' : null,
    email_notifications: true, family_ids: [], created_at: daysAgo(60 - i), updated_at: daysAgo(10),
  }));
  const user = (id: string) => users.find((u) => u.id === id)!;

  const families: Family[] = [
    { id: 'fam-rivers', name: 'The Rivers Family', emoji: '🏠', color: '#e60012', owner_id: 'p-maya', member_ids: ['p-maya', 'p-alex', 'p-leo', 'p-zoe'], admin_ids: ['p-maya'], created_at: daysAgo(60) },
    { id: 'fam-cousins', name: 'Cousins Club', emoji: '🌴', color: '#00b894', owner_id: 'p-zoe', member_ids: ['p-zoe', 'p-leo'], admin_ids: ['p-zoe'], created_at: daysAgo(20) },
  ];
  const members: Scoped<Member>[] = [];
  for (const f of families) {
    for (const uid of f.member_ids) {
      const u = user(uid);
      u.family_ids.push(f.id);
      const { family_ids: _ignored, email_notifications: _e, ...profile } = u;
      void _ignored;
      void _e;
      members.push({ ...profile, family_id: f.id, role: f.owner_id === uid ? 'owner' : f.admin_ids.includes(uid) ? 'admin' : 'member', status: 'active', joined_at: f.created_at });
    }
  }

  const base = (seedGames as unknown as Omit<GameInput, 'features'>[]).map((g, i) => ({ ...g, features: [], idx: i }));
  const games: Scoped<Game>[] = [];
  const gameFor = (fid: string, gi: number): string => {
    const id = `${fid}-g${gi}`;
    if (!games.some((g) => g.id === id)) {
      const { idx: _i, ...g } = base[gi];
      void _i;
      games.push({ ...g, id, family_id: fid, source: 'nintendo', created_by: null, created_at: daysAgo(40 - gi) });
    }
    return id;
  };

  const library: Scoped<LibraryItem>[] = [];
  let n = 0;
  const own = (fid: string, owner: string, idxs: number[]) => {
    for (const gi of idxs) {
      if (!base[gi]) continue;
      library.push({
        id: `i-${n}`, family_id: fid, owner_id: owner, game_id: gameFor(fid, gi),
        format: n % 5 === 3 ? 'digital' : 'physical',
        condition: n % 5 === 3 ? null : (['mint', 'good', 'good', 'fair'] as const)[n % 4],
        notes: n % 7 === 0 ? 'Case is a bit scratched but the cartridge is perfect.' : null,
        lendable: n % 11 !== 5, created_at: daysAgo(30 - n * 0.7),
      });
      n++;
    }
  };
  own('fam-rivers', 'p-maya', [4, 9, 10, 22, 14, 6, 23, 0]);
  own('fam-rivers', 'p-alex', [0, 1, 17, 2, 5, 18, 21]);
  own('fam-rivers', 'p-leo', [15, 16, 3, 12, 6, 24, 19]);
  own('fam-rivers', 'p-zoe', [9, 13, 1, 20, 25, 8, 11]);
  own('fam-cousins', 'p-zoe', [9, 13, 20, 25]);
  own('fam-cousins', 'p-leo', [15, 16, 24]);

  const loans: Scoped<Loan>[] = [];
  const events: Scoped<LoanEvent>[] = [];
  const notifications: DemoState['notifications'] = [];
  const titleOf = (gameId: string) => games.find((g) => g.id === gameId)?.title ?? null;
  const ev = (loan: Scoped<Loan>, actor: string, kind: LoanEventKind, body: string | null, at: string) =>
    events.push({ id: uuid(), family_id: loan.family_id, loan_id: loan.id, actor_id: actor, kind, body, created_at: at });
  const note = (to: string, actor: string, loan: Scoped<Loan>, kind: string, body: string | null, at: string) =>
    notifications.push({
      id: uuid(), user_id: to, family_id: loan.family_id, actor_id: actor, actor_name: nameOf(user(actor)), loan_id: loan.id,
      game_title: titleOf(loan.game_id), kind, body, read_at: null, created_at: at,
    });
  const mkLoan = (fid: string, owner: string, borrower: string, gi: number, status: Loan['status'], age: number, message: string | null, extra: Partial<Loan> = {}) => {
    const it = library.find((l) => l.family_id === fid && l.owner_id === owner && l.game_id === `${fid}-g${gi}`);
    if (!it) return null;
    const loan: Scoped<Loan> = {
      id: uuid(), family_id: fid, item_id: it.id, game_id: it.game_id, lender_id: owner, borrower_id: borrower, status,
      request_message: message, due_at: null, requested_at: daysAgo(age), responded_at: null, lent_at: null,
      returned_at: null, created_at: daysAgo(age), updated_at: daysAgo(age), ...extra,
    };
    loans.push(loan);
    if (loan.requested_at) ev(loan, borrower, 'requested', message, daysAgo(age));
    return loan;
  };

  const R = 'fam-rivers';
  const a = mkLoan(R, 'p-alex', 'p-leo', 17, 'active', 6, 'Can I take Mario Kart World to Sam’s sleepover?', { responded_at: daysAgo(5.8), lent_at: daysAgo(5.8), due_at: dateIn(4) });
  if (a) {
    ev(a, 'p-alex', 'accepted', 'Sure — bring it back before the weekend!', daysAgo(5.8));
    ev(a, 'p-leo', 'comment', 'Thanks Dad!! 🏎️', daysAgo(5.7));
  }
  const b = mkLoan(R, 'p-maya', 'p-zoe', 10, 'active', 12, null, { requested_at: null, responded_at: daysAgo(12), lent_at: daysAgo(12), due_at: dateIn(-1) });
  if (b) {
    ev(b, 'p-maya', 'lent', 'For the long flight ✈️', daysAgo(12));
    ev(b, 'p-zoe', 'comment', 'Almost done with it — I’ll drop it off tomorrow!', daysAgo(0.1));
    note('p-maya', 'p-zoe', b, 'loan_comment', 'Almost done with it — I’ll drop it off tomorrow!', daysAgo(0.1));
  }
  const c = mkLoan(R, 'p-zoe', 'p-maya', 1, 'pending', 0.3, 'Could I borrow Smash for game night on Friday? 🙏');
  if (c) note('p-zoe', 'p-maya', c, 'loan_requested', c.request_message, c.created_at);
  const d = mkLoan(R, 'p-leo', 'p-maya', 16, 'pending', 1.2, 'Heard this one is great — can I try it?');
  if (d) note('p-leo', 'p-maya', d, 'loan_requested', d.request_message, d.created_at);
  const e = mkLoan(R, 'p-maya', 'p-alex', 4, 'returned', 25, 'Need to check my island 🏝️', { responded_at: daysAgo(24), lent_at: daysAgo(24), returned_at: daysAgo(15) });
  if (e) {
    ev(e, 'p-maya', 'accepted', null, daysAgo(24));
    ev(e, 'p-alex', 'returned', 'Returned it on the shelf.', daysAgo(15));
  }
  const f = mkLoan(R, 'p-alex', 'p-maya', 0, 'pending', 2, 'Can I borrow your Mario Kart 8 for the kids?');
  if (f) note('p-alex', 'p-maya', f, 'loan_requested', f.request_message, f.created_at);
  const g = mkLoan(R, 'p-leo', 'p-alex', 15, 'declined', 9, 'Can I try Hollow Knight?', { responded_at: daysAgo(8.5) });
  if (g) ev(g, 'p-leo', 'declined', 'Sorry Dad, I’m mid-run 😅 next month!', daysAgo(8.5));
  const h = mkLoan('fam-cousins', 'p-zoe', 'p-leo', 20, 'active', 3, 'Co-op weekend?', { responded_at: daysAgo(2.9), lent_at: daysAgo(2.9), due_at: dateIn(10) });
  if (h) ev(h, 'p-zoe', 'accepted', 'Yes! Call me when you get stuck.', daysAgo(2.9));

  const invites: Invite[] = [
    { id: 'inv-alex-cousins', family_id: 'fam-cousins', family_name: 'Cousins Club', family_emoji: '🌴', email: 'alex@demo.family', role: 'member', invited_by: 'p-zoe', invited_by_name: 'Auntie Zo', status: 'pending', created_at: daysAgo(1) },
    { id: 'inv-grandpa', family_id: R, family_name: 'The Rivers Family', family_emoji: '🏠', email: 'grandpa@demo.family', role: 'member', invited_by: 'p-maya', invited_by_name: 'Mom', status: 'pending', created_at: daysAgo(2) },
  ];

  return { users, families, members, games, library, loans, events, notifications, invites };
}

const strip = <T extends object>(x: T) => {
  const { family_id: _f, user_id: _u, ...rest } = x as T & { family_id?: string; user_id?: string };
  void _f;
  void _u;
  return rest;
};

export function createDemoApi(): Api {
  let state: DemoState;
  try {
    state = JSON.parse(localStorage.getItem(STORE_KEY) ?? '') as DemoState;
    if (!state?.families) throw new Error('empty');
  } catch {
    state = seed();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* storage blocked: demo still works in memory */
    }
  }

  let familyId: string | null = null;
  const listeners = new Set<(t: Table) => void>();
  const authListeners = new Set<(s: Session | null) => void>();
  const ALL: Table[] = ['me', 'families', 'my_invites', 'notifications', 'members', 'games', 'library_items', 'loans', 'loan_events', 'family_invites'];

  const save = (...tables: Table[]) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
    for (const t of tables) listeners.forEach((l) => l(t));
  };

  const getSession = (): Session | null => {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
      return s && state.users.some((u) => u.id === s.userId) ? s : null;
    } catch {
      return null;
    }
  };
  const me = () => {
    const s = getSession();
    if (!s) throw new Error('You are signed out.');
    return state.users.find((u) => u.id === s.userId)!;
  };
  const fam = (): Family => {
    const f = state.families.find((x) => x.id === familyId);
    if (!f) throw new Error('Pick a family first.');
    if (!f.member_ids.includes(me().id)) throw new Error('You are not a member of this family.');
    return f;
  };
  const roleIn = (f: Family, uid: string): Role => (f.owner_id === uid ? 'owner' : f.admin_ids.includes(uid) ? 'admin' : 'member');
  const requireAdmin = (f: Family) => {
    if (roleIn(f, me().id) === 'member') throw new Error('Only family admins can do that.');
  };

  const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
  const run = <T,>(fn: () => T, ...tables: Table[]): Promise<T> => {
    try {
      const result = fn();
      save(...tables);
      return delay(result, 200);
    } catch (e) {
      return Promise.reject(e);
    }
  };

  const signInAs = (email: string) => {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('That does not look like an email address.');
    let u = state.users.find((x) => x.email === e);
    if (!u) {
      const name = e.split('@')[0].replace(/[._+-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      u = {
        id: `p-${uuid().slice(0, 8)}`, email: e, display_name: name, nickname: name.split(' ')[0], avatar_url: null,
        avatar_icon: '⭐', accent_color: '#ff8c00', bio: null, friend_code: null, email_notifications: true,
        family_ids: [], created_at: now(), updated_at: now(),
      };
      state.users.push(u);
      save('me');
    }
    const session = { userId: u.id, email: e };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    familyId = null;
    authListeners.forEach((l) => l(session));
  };

  // ------------------------------------------------------------------------
  const log = (loan: Scoped<Loan>, actor: string, kind: LoanEventKind, body: string | null, notify: string | null) => {
    const text = body?.trim() || null;
    state.events.push({ id: uuid(), family_id: loan.family_id, loan_id: loan.id, actor_id: actor, kind, body: text, created_at: now() });
    if (notify && notify !== actor) {
      state.notifications.unshift({
        id: uuid(), user_id: notify, family_id: loan.family_id, actor_id: actor, actor_name: nameOf(me()), loan_id: loan.id,
        game_title: state.games.find((g) => g.id === loan.game_id)?.title ?? null, kind: `loan_${kind}`, body: text,
        read_at: null, created_at: now(),
      });
    }
  };
  const loanById = (id: string) => {
    const loan = state.loans.find((l) => l.id === id && l.family_id === fam().id);
    if (!loan) throw new Error('That loan no longer exists.');
    return loan;
  };
  const activate = (loan: Scoped<Loan>, actor: string, due: string | null) => {
    if (state.loans.some((l) => l.item_id === loan.item_id && l.status === 'active' && l.id !== loan.id)) {
      throw new Error('This copy is already lent out — mark it returned first.');
    }
    Object.assign(loan, { status: 'active', responded_at: now(), lent_at: now(), due_at: due, updated_at: now() });
    for (const other of state.loans.filter((l) => l.item_id === loan.item_id && l.status === 'pending' && l.id !== loan.id)) {
      Object.assign(other, { status: 'declined', responded_at: now(), updated_at: now() });
      log(other, actor, 'declined', 'This copy was lent to someone else. Try again once it is returned!', other.borrower_id);
    }
  };
  const addMember = (f: Family, u: DemoUser, role: Role) => {
    const { family_ids: _a, email_notifications: _b, ...profile } = u;
    void _a;
    void _b;
    state.members = state.members.filter((m) => !(m.family_id === f.id && m.id === u.id));
    state.members.push({ ...profile, family_id: f.id, role, status: 'active', joined_at: now() });
    if (!f.member_ids.includes(u.id)) f.member_ids.push(u.id);
    if (role !== 'member' && !f.admin_ids.includes(u.id)) f.admin_ids.push(u.id);
    if (!u.family_ids.includes(f.id)) u.family_ids.push(f.id);
  };
  const removeFromFamily = (f: Family, uid: string) => {
    const open = state.loans.filter((l) => l.family_id === f.id && (l.lender_id === uid || l.borrower_id === uid) && ['pending', 'active'].includes(l.status));
    if (open.some((l) => l.status === 'active')) throw new Error('They still have games on loan. Mark those loans as returned first.');
    for (const l of open) {
      Object.assign(l, { status: 'cancelled', responded_at: now(), updated_at: now() });
      log(l, me().id, 'cancelled', 'This person left the family.', l.lender_id === uid ? l.borrower_id : l.lender_id);
    }
    state.library = state.library.filter((i) => !(i.family_id === f.id && i.owner_id === uid));
    const m = state.members.find((x) => x.family_id === f.id && x.id === uid);
    if (m) Object.assign(m, { status: 'removed', role: 'member' });
    f.member_ids = f.member_ids.filter((x) => x !== uid);
    f.admin_ids = f.admin_ids.filter((x) => x !== uid);
    const u = state.users.find((x) => x.id === uid);
    if (u) u.family_ids = u.family_ids.filter((x) => x !== f.id);
  };

  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY && e.newValue) {
      state = JSON.parse(e.newValue);
      ALL.forEach((t) => listeners.forEach((l) => l(t)));
    }
    if (e.key === SESSION_KEY) authListeners.forEach((l) => l(getSession()));
  });

  const inFamily = <T extends { family_id: string }>(xs: T[]) => xs.filter((x) => x.family_id === fam().id).map(strip);

  return {
    mode: 'demo',

    getSession: () => delay(getSession(), 0),
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async sendLoginLink(email) {
      // No email in demo mode: sign straight in.
      signInAs(email);
    },
    isLoginLink: () => false,
    async completeLoginLink() {},
    signInWithGoogle: () => Promise.reject(new Error('Google sign-in is not available in demo mode.')),
    async signOut() {
      localStorage.removeItem(SESSION_KEY);
      familyId = null;
      authListeners.forEach((l) => l(null));
    },

    getMe: () => delay(strip(me()) as Profile, 0),
    updateMyProfile: (patch) =>
      run(() => {
        const u = me();
        if (patch.friend_code && !/^SW-\d{4}-\d{4}-\d{4}$/.test(patch.friend_code)) throw new Error('Friend codes look like SW-1234-5678-9012');
        if (patch.display_name !== undefined && !patch.display_name.trim()) throw new Error('Account name is required.');
        Object.assign(u, patch, { updated_at: now() });
        const { email_notifications: _e, ...shared } = patch;
        void _e;
        state.members.filter((m) => m.id === u.id).forEach((m) => Object.assign(m, shared));
      }, 'me', 'members'),
    uploadAvatar(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read that image'));
        reader.readAsDataURL(file);
      });
    },

    listMyFamilies() {
      const s = getSession();
      return delay(s ? state.families.filter((f) => f.member_ids.includes(s.userId)) : [], 0);
    },
    listMyInvites() {
      const s = getSession();
      return delay(s ? state.invites.filter((i) => i.email === s.email && i.status === 'pending') : [], 0);
    },
    getInvite(inviteId) {
      const s = getSession();
      const inv = state.invites.find((i) => i.id === inviteId);
      return delay(inv && s && (inv.email === s.email || state.families.find((f) => f.id === inv.family_id)?.admin_ids.includes(s.userId)) ? inv : null);
    },
    createFamily: (input) =>
      run(() => {
        const u = me();
        if (!input.name.trim()) throw new Error('Family name is required.');
        if (u.family_ids.length >= 10) throw new Error('You can be in at most 10 families.');
        const f: Family = { id: `fam-${uuid().slice(0, 8)}`, name: input.name.trim().slice(0, 40), emoji: input.emoji || '🏠', color: input.color, owner_id: u.id, member_ids: [], admin_ids: [], created_at: now() };
        state.families.push(f);
        addMember(f, u, 'owner');
        return f.id;
      }, 'families', 'me'),
    acceptInvite: (inviteId) =>
      run(() => {
        const u = me();
        const inv = state.invites.find((i) => i.id === inviteId && i.email === u.email);
        if (!inv) throw new Error('That invite was not found. It may have been sent to a different email address.');
        if (inv.status !== 'pending') throw new Error('That invite is no longer valid.');
        const f = state.families.find((x) => x.id === inv.family_id);
        if (!f) throw new Error('That family no longer exists.');
        inv.status = 'accepted';
        if (!f.member_ids.includes(u.id)) {
          addMember(f, u, inv.role);
          state.notifications.unshift({
            id: uuid(), user_id: inv.invited_by, family_id: f.id, actor_id: u.id, actor_name: nameOf(u), loan_id: null,
            game_title: null, kind: 'member_joined', body: null, read_at: null, created_at: now(),
          });
        }
        return f.id;
      }, 'families', 'my_invites', 'members', 'me'),
    declineInvite: (inviteId) =>
      run(() => {
        const inv = state.invites.find((i) => i.id === inviteId && i.email === me().email);
        if (inv) inv.status = 'declined';
      }, 'my_invites'),
    selectFamily(id) {
      familyId = id;
    },

    updateFamily: (patch) =>
      run(() => {
        const f = fam();
        requireAdmin(f);
        if (patch.name !== undefined) {
          if (!patch.name.trim()) throw new Error('Family name is required.');
          f.name = patch.name.trim().slice(0, 40);
        }
        if (patch.emoji) f.emoji = patch.emoji;
        if (patch.color) f.color = patch.color;
        state.invites.filter((i) => i.family_id === f.id).forEach((i) => Object.assign(i, { family_name: f.name, family_emoji: f.emoji }));
      }, 'families'),
    deleteFamily: () =>
      run(() => {
        const f = fam();
        if (f.owner_id !== me().id) throw new Error('Only the family owner can delete the family.');
        state.users.forEach((u) => (u.family_ids = u.family_ids.filter((x) => x !== f.id)));
        state.families = state.families.filter((x) => x.id !== f.id);
        for (const k of ['members', 'games', 'library', 'loans', 'events'] as const) {
          (state[k] as { family_id: string }[]) = (state[k] as { family_id: string }[]).filter((x) => x.family_id !== f.id);
        }
        state.invites = state.invites.filter((i) => i.family_id !== f.id);
        familyId = null;
      }, 'families', 'me'),
    leaveFamily: () =>
      run(() => {
        const f = fam();
        if (f.owner_id === me().id) throw new Error('Owners can’t leave — delete the family instead.');
        removeFromFamily(f, me().id);
        familyId = null;
      }, 'families', 'me'),
    listFamilyInvites() {
      const f = fam();
      return delay(state.invites.filter((i) => i.family_id === f.id && i.status === 'pending'));
    },
    inviteMember: (email, role) =>
      run(() => {
        const f = fam();
        requireAdmin(f);
        const e = email.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('That does not look like an email address.');
        if (state.members.some((m) => m.family_id === f.id && m.email === e && m.status === 'active')) throw new Error('That person is already in the family.');
        state.invites = state.invites.filter((i) => !(i.family_id === f.id && i.email === e && i.status === 'pending'));
        state.invites.push({
          id: `inv-${uuid().slice(0, 10)}`, family_id: f.id, family_name: f.name, family_emoji: f.emoji, email: e, role,
          invited_by: me().id, invited_by_name: nameOf(me()), status: 'pending', created_at: now(),
        });
      }, 'family_invites', 'my_invites'),
    revokeInvite: (inviteId) =>
      run(() => {
        requireAdmin(fam());
        const inv = state.invites.find((i) => i.id === inviteId);
        if (inv) inv.status = 'revoked';
      }, 'family_invites'),
    removeMember: (userId) =>
      run(() => {
        const f = fam();
        if (userId === f.owner_id) throw new Error('The owner can’t be removed.');
        requireAdmin(f);
        if (f.admin_ids.includes(userId) && roleIn(f, me().id) !== 'owner') throw new Error('Only the owner can remove an admin.');
        removeFromFamily(f, userId);
      }, 'families', 'members', 'library_items', 'loans'),
    setMemberRole: (userId, role) =>
      run(() => {
        const f = fam();
        requireAdmin(f);
        if (userId === f.owner_id) throw new Error('The owner is always an admin.');
        if (role === 'member' && f.admin_ids.includes(userId) && roleIn(f, me().id) !== 'owner' && userId !== me().id) {
          throw new Error('Only the owner can demote another admin.');
        }
        f.admin_ids = role === 'admin' ? [...new Set([...f.admin_ids, userId])] : f.admin_ids.filter((x) => x !== userId);
        const m = state.members.find((x) => x.family_id === f.id && x.id === userId);
        if (m) m.role = role;
      }, 'families', 'members'),

    listMembers: () => delay(inFamily(state.members).sort((a, b) => a.display_name.localeCompare(b.display_name)) as Member[]),
    listGames: () => delay(inFamily(state.games) as Game[]),
    listLibrary: () => delay((inFamily(state.library) as LibraryItem[]).sort((a, b) => b.created_at.localeCompare(a.created_at))),
    listLoans: () => delay((inFamily(state.loans) as Loan[]).sort((a, b) => b.created_at.localeCompare(a.created_at))),
    listLoanEvents: (loanId) =>
      delay((inFamily(state.events) as LoanEvent[]).filter((e) => e.loan_id === loanId).sort((a, b) => a.created_at.localeCompare(b.created_at))),
    listNotifications() {
      const s = getSession();
      return delay(s ? state.notifications.filter((n) => n.user_id === s.userId).slice(0, 60).map(strip) as AppNotification[] : []);
    },

    addToLibrary: (game, opts) =>
      run(() => {
        const f = fam();
        const owner = me().id;
        let gameId: string;
        if ('id' in game) {
          gameId = game.id;
          if (!state.games.some((g) => g.id === gameId && g.family_id === f.id)) throw new Error('That game is not in the family catalog.');
        } else {
          const existing = game.nsuid ? state.games.find((g) => g.family_id === f.id && g.nsuid === game.nsuid) : undefined;
          gameId = existing?.id ?? (game.nsuid ? `ns_${game.nsuid}_${f.id}` : uuid());
          if (!existing) {
            state.games.push({ ...game, id: gameId, family_id: f.id, source: game.nsuid ? 'nintendo' : 'manual', created_by: owner, created_at: now() });
          }
        }
        const id = uuid();
        state.library.unshift({
          id, family_id: f.id, owner_id: owner, game_id: gameId, format: opts.format, condition: opts.condition ?? null,
          notes: opts.notes?.trim() || null, lendable: true, created_at: now(),
        });
        return id;
      }, 'games', 'library_items'),
    updateLibraryItem: (id, patch) =>
      run(() => {
        const item = state.library.find((i) => i.id === id && i.family_id === fam().id && i.owner_id === me().id);
        if (!item) throw new Error("You don't have permission to do that.");
        Object.assign(item, patch);
      }, 'library_items'),
    removeLibraryItem: (id) =>
      run(() => {
        const f = fam();
        const owner = me().id;
        const item = state.library.find((i) => i.id === id && i.family_id === f.id && i.owner_id === owner);
        if (!item) throw new Error('You can only remove your own games.');
        if (state.loans.some((l) => l.item_id === id && l.status === 'active')) throw new Error('This game is currently lent out — mark it returned first.');
        for (const l of state.loans.filter((x) => x.item_id === id && x.status === 'pending')) {
          Object.assign(l, { status: 'cancelled', responded_at: now() });
          log(l, owner, 'cancelled', 'The owner removed this game from their library.', l.borrower_id);
        }
        state.library = state.library.filter((i) => i.id !== id);
      }, 'library_items', 'loans', 'notifications'),

    requestLoan: (itemId, message) =>
      run(() => {
        const f = fam();
        const borrower = me().id;
        const item = state.library.find((i) => i.id === itemId && i.family_id === f.id);
        if (!item) throw new Error('That game is no longer in the library.');
        if (item.owner_id === borrower) throw new Error('You already own this copy.');
        if (!item.lendable) throw new Error('The owner is not lending this game right now.');
        if (state.loans.some((l) => l.item_id === itemId && l.borrower_id === borrower && ['pending', 'active'].includes(l.status))) {
          throw new Error('You already have an open request for this game.');
        }
        const loan: Scoped<Loan> = {
          id: uuid(), family_id: f.id, item_id: itemId, game_id: item.game_id, lender_id: item.owner_id, borrower_id: borrower,
          status: 'pending', request_message: message.trim() || null, due_at: null, requested_at: now(), responded_at: null,
          lent_at: null, returned_at: null, created_at: now(), updated_at: now(),
        };
        state.loans.unshift(loan);
        log(loan, borrower, 'requested', message, item.owner_id);
        return loan.id;
      }, 'loans', 'loan_events', 'notifications'),
    respondToLoan: (loanId, accept, message, due) =>
      run(() => {
        const actor = me().id;
        const loan = loanById(loanId);
        if (loan.lender_id !== actor) throw new Error('Only the owner can answer this request.');
        if (loan.status !== 'pending') throw new Error('This request was already answered.');
        if (accept) {
          activate(loan, actor, due);
          log(loan, actor, 'accepted', message, loan.borrower_id);
        } else {
          Object.assign(loan, { status: 'declined', responded_at: now(), updated_at: now() });
          log(loan, actor, 'declined', message, loan.borrower_id);
        }
      }, 'loans', 'loan_events', 'notifications'),
    cancelLoanRequest: (loanId, message) =>
      run(() => {
        const actor = me().id;
        const loan = loanById(loanId);
        if (loan.borrower_id !== actor) throw new Error('Only the person who asked can cancel.');
        if (loan.status !== 'pending') throw new Error('This request was already answered.');
        Object.assign(loan, { status: 'cancelled', responded_at: now(), updated_at: now() });
        log(loan, actor, 'cancelled', message, loan.lender_id);
      }, 'loans', 'loan_events', 'notifications'),
    lendGame: (itemId, borrowerId, due, message) =>
      run(() => {
        const f = fam();
        const actor = me().id;
        const item = state.library.find((i) => i.id === itemId && i.family_id === f.id);
        if (!item || item.owner_id !== actor) throw new Error('You can only lend your own games.');
        if (borrowerId === actor) throw new Error('Pick someone else.');
        if (!f.member_ids.includes(borrowerId)) throw new Error('That person is not in the family.');
        const pending = state.loans.find((l) => l.item_id === itemId && l.borrower_id === borrowerId && l.status === 'pending');
        if (pending) {
          activate(pending, actor, due);
          log(pending, actor, 'accepted', message, borrowerId);
          return pending.id;
        }
        if (state.loans.some((l) => l.item_id === itemId && l.status === 'active')) throw new Error('This copy is already lent out — mark it returned first.');
        const loan: Scoped<Loan> = {
          id: uuid(), family_id: f.id, item_id: itemId, game_id: item.game_id, lender_id: actor, borrower_id: borrowerId,
          status: 'pending', request_message: null, due_at: due, requested_at: null, responded_at: now(), lent_at: now(),
          returned_at: null, created_at: now(), updated_at: now(),
        };
        state.loans.unshift(loan);
        activate(loan, actor, due);
        log(loan, actor, 'lent', message, borrowerId);
        return loan.id;
      }, 'loans', 'loan_events', 'notifications'),
    markReturned: (loanId, message) =>
      run(() => {
        const actor = me().id;
        const loan = loanById(loanId);
        if (![loan.lender_id, loan.borrower_id].includes(actor)) throw new Error('Only the two people involved can do that.');
        if (loan.status !== 'active') throw new Error('This game is not currently lent out.');
        Object.assign(loan, { status: 'returned', returned_at: now(), updated_at: now() });
        log(loan, actor, 'returned', message, actor === loan.lender_id ? loan.borrower_id : loan.lender_id);
      }, 'loans', 'loan_events', 'notifications'),
    setLoanDue: (loanId, due) =>
      run(() => {
        const actor = me().id;
        const loan = loanById(loanId);
        if (loan.lender_id !== actor) throw new Error('Only the owner can change the due date.');
        loan.due_at = due;
        const label = due ? 'Due ' + new Date(due + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No due date';
        log(loan, actor, 'due_changed', label, loan.borrower_id);
      }, 'loans', 'loan_events', 'notifications'),
    commentOnLoan: (loanId, body) =>
      run(() => {
        const actor = me().id;
        const loan = loanById(loanId);
        if (!body.trim()) throw new Error('Write something first.');
        if (![loan.lender_id, loan.borrower_id].includes(actor)) throw new Error('Only the two people involved can comment.');
        log(loan, actor, 'comment', body, actor === loan.lender_id ? loan.borrower_id : loan.lender_id);
      }, 'loan_events', 'notifications'),

    markNotificationsRead: (ids) =>
      run(() => {
        const s = getSession();
        state.notifications.forEach((n) => {
          if (n.user_id === s?.userId && !n.read_at && (!ids || ids.includes(n.id))) n.read_at = now();
        });
      }, 'notifications'),

    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

/** Wipe demo data (used by the "Reset demo" button). */
export function resetDemo() {
  localStorage.removeItem(STORE_KEY);
  window.location.reload();
}

