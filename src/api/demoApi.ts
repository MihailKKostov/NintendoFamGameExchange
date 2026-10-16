/*
 * Demo backend: the whole app running in the browser with sample data kept in
 * localStorage. Used automatically when no Supabase credentials are configured,
 * so the site can be previewed (and tested) before the backend is set up.
 * The business rules mirror the SQL functions in supabase/migrations.
 */
import type {
  AppNotification, Game, GameInput, Invite, LibraryItem, Loan, LoanEvent, LoanEventKind, Profile, Session,
} from '../types';
import seedGames from './demoSeed.json';
import type { Api, Table } from './types';

const STORE_KEY = 'fge-demo-v1';
const SESSION_KEY = 'fge-demo-session';

interface DemoState {
  profiles: Profile[];
  games: Game[];
  library: LibraryItem[];
  loans: Loan[];
  events: LoanEvent[];
  notifications: AppNotification[];
  invites: Invite[];
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const dateIn = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

function seed(): DemoState {
  const people: [string, string, string, string, string, string | null][] = [
    // id, email, name, nickname, icon, bio
    ['p-maya', 'maya@demo.family', 'Maya Rivers', 'Mom', '🌸', 'Cozy games only. Will trade Animal Crossing turnips for cookies.'],
    ['p-alex', 'alex@demo.family', 'Alex Rivers', 'Dad', '🐢', 'Kart champion of 2019 (disputed).'],
    ['p-leo', 'leo@demo.family', 'Leo Rivers', 'Leo', '👾', 'Speedrunning everything. Please return my Metroid.'],
    ['p-zoe', 'zoe@demo.family', 'Zoe Chen', 'Auntie Zo', '🦊', 'Party game hoarder. Ask me for Mario Party!'],
  ];
  const colors = ['#e60012', '#0ab9e6', '#1edc00', '#b400e6'];
  const profiles: Profile[] = people.map(([id, email, display_name, nickname, avatar_icon, bio], i) => ({
    id, email, display_name, nickname, avatar_icon, bio,
    avatar_url: null,
    accent_color: colors[i],
    friend_code: i === 0 ? 'SW-1234-5678-9012' : i === 2 ? 'SW-4821-0093-7715' : null,
    email_notifications: true,
    created_at: daysAgo(60 - i),
    updated_at: daysAgo(10),
  }));

  const games: Game[] = (seedGames as unknown as Omit<GameInput, 'features'>[]).map((g, i) => ({
    ...g,
    features: [],
    id: `g-${i}`,
    source: 'nintendo',
    created_by: profiles[i % 4].id,
    created_at: daysAgo(40 - i),
  }));

  // Who owns what (indexes into the seed list).
  const owners: Record<string, number[]> = {
    'p-maya': [4, 9, 10, 22, 14, 6, 23, 0],
    'p-alex': [0, 1, 17, 2, 5, 18, 21],
    'p-leo': [15, 16, 3, 12, 6, 24, 19],
    'p-zoe': [9, 13, 1, 20, 25, 8, 11],
  };
  const library: LibraryItem[] = [];
  let n = 0;
  for (const [owner, idxs] of Object.entries(owners)) {
    for (const gi of idxs) {
      if (!games[gi]) continue;
      library.push({
        id: `i-${n}`,
        owner_id: owner,
        game_id: games[gi].id,
        format: n % 5 === 3 ? 'digital' : 'physical',
        condition: n % 5 === 3 ? null : (['mint', 'good', 'good', 'fair'] as const)[n % 4],
        notes: n % 7 === 0 ? 'Case is a bit scratched but the cartridge is perfect.' : null,
        lendable: n % 11 !== 5,
        created_at: daysAgo(30 - n * 0.7),
      });
      n++;
    }
  }

  const item = (owner: string, gi: number) => library.find((l) => l.owner_id === owner && l.game_id === games[gi]?.id)!;
  const loans: Loan[] = [];
  const events: LoanEvent[] = [];
  const notifications: AppNotification[] = [];
  const mkLoan = (
    owner: string, borrower: string, gi: number, status: Loan['status'], ageDays: number,
    message: string | null, extra: Partial<Loan> = {},
  ) => {
    const it = item(owner, gi);
    if (!it) return null;
    const loan: Loan = {
      id: uuid(), item_id: it.id, game_id: it.game_id, lender_id: owner, borrower_id: borrower, status,
      request_message: message, due_at: null, requested_at: daysAgo(ageDays), responded_at: null,
      lent_at: null, returned_at: null, created_at: daysAgo(ageDays), updated_at: daysAgo(ageDays), ...extra,
    };
    loans.push(loan);
    events.push({ id: uuid(), loan_id: loan.id, actor_id: borrower, kind: 'requested', body: message, created_at: daysAgo(ageDays) });
    return loan;
  };

  const a = mkLoan('p-alex', 'p-leo', 17, 'active', 6, 'Can I take Mario Kart World to Sam’s sleepover?', {
    responded_at: daysAgo(5.8), lent_at: daysAgo(5.8), due_at: dateIn(4),
  });
  if (a) {
    events.push({ id: uuid(), loan_id: a.id, actor_id: 'p-alex', kind: 'accepted', body: 'Sure — bring it back before the weekend!', created_at: daysAgo(5.8) });
    events.push({ id: uuid(), loan_id: a.id, actor_id: 'p-leo', kind: 'comment', body: 'Thanks Dad!! 🏎️', created_at: daysAgo(5.7) });
  }
  const b = mkLoan('p-maya', 'p-zoe', 10, 'active', 12, null, { responded_at: daysAgo(12), lent_at: daysAgo(12), due_at: dateIn(-1), requested_at: null });
  if (b) {
    events.length = events.length - 1; // direct lend, no request event
    events.push({ id: uuid(), loan_id: b.id, actor_id: 'p-maya', kind: 'lent', body: 'For the long flight ✈️', created_at: daysAgo(12) });
  }
  const c = mkLoan('p-zoe', 'p-maya', 1, 'pending', 0.3, 'Could I borrow Smash for game night on Friday? 🙏');
  if (c) {
    notifications.push({ id: uuid(), user_id: 'p-zoe', actor_id: 'p-maya', loan_id: c.id, kind: 'loan_requested', body: c.request_message, read_at: null, created_at: c.created_at });
  }
  const d = mkLoan('p-leo', 'p-maya', 16, 'pending', 1.2, 'Heard this one is great — can I try it?');
  if (d) {
    notifications.push({ id: uuid(), user_id: 'p-leo', actor_id: 'p-maya', loan_id: d.id, kind: 'loan_requested', body: d.request_message, read_at: null, created_at: d.created_at });
  }
  const e = mkLoan('p-maya', 'p-alex', 4, 'returned', 25, 'Need to check my island 🏝️', {
    responded_at: daysAgo(24), lent_at: daysAgo(24), returned_at: daysAgo(15),
  });
  if (e) {
    events.push({ id: uuid(), loan_id: e.id, actor_id: 'p-maya', kind: 'accepted', body: null, created_at: daysAgo(24) });
    events.push({ id: uuid(), loan_id: e.id, actor_id: 'p-alex', kind: 'returned', body: 'Returned it on the shelf.', created_at: daysAgo(15) });
  }
  const f = mkLoan('p-alex', 'p-maya', 0, 'pending', 2, 'Can I borrow your Mario Kart 8 for the kids?');
  if (f) {
    notifications.push({ id: uuid(), user_id: 'p-alex', actor_id: 'p-maya', loan_id: f.id, kind: 'loan_requested', body: f.request_message, read_at: null, created_at: f.created_at });
  }
  const g = mkLoan('p-leo', 'p-alex', 15, 'declined', 9, 'Can I try Hollow Knight?', { responded_at: daysAgo(8.5) });
  if (g) events.push({ id: uuid(), loan_id: g.id, actor_id: 'p-leo', kind: 'declined', body: 'Sorry Dad, I’m mid-run 😅 next month!', created_at: daysAgo(8.5) });

  notifications.push({
    id: uuid(), user_id: 'p-maya', actor_id: 'p-zoe', loan_id: b?.id ?? null, kind: 'loan_comment',
    body: 'Almost done with it — I’ll drop it off tomorrow!', read_at: null, created_at: daysAgo(0.1),
  });
  if (b) events.push({ id: uuid(), loan_id: b.id, actor_id: 'p-zoe', kind: 'comment', body: 'Almost done with it — I’ll drop it off tomorrow!', created_at: daysAgo(0.1) });

  const invites: Invite[] = [
    ...profiles.map((p, i) => ({ email: p.email, is_admin: i === 0, note: null, invited_by: i === 0 ? null : 'p-maya', created_at: p.created_at })),
    { email: 'grandpa@demo.family', is_admin: false, note: 'Grandpa Joe', invited_by: 'p-maya', created_at: daysAgo(2) },
  ];

  return { profiles, games, library, loans, events, notifications, invites };
}

export function createDemoApi(): Api {
  let state: DemoState;
  try {
    state = JSON.parse(localStorage.getItem(STORE_KEY) ?? '') as DemoState;
    if (!state?.profiles) throw new Error('empty');
  } catch {
    state = seed();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* storage blocked: demo still works in memory */
    }
  }

  const listeners = new Set<(t: Table) => void>();
  const authListeners = new Set<(s: Session | null) => void>();

  const save = (...tables: Table[]) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: keep working in memory */
    }
    for (const t of tables) listeners.forEach((l) => l(t));
  };

  const getSession = (): Session | null => {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
      return s && state.profiles.some((p) => p.id === s.userId) ? s : null;
    } catch {
      return null;
    }
  };

  const me = () => {
    const s = getSession();
    if (!s) throw new Error('You are signed out.');
    if (!state.invites.some((i) => i.email === s.email)) throw new Error('You are not a member of this group');
    return s.userId;
  };

  const delay = <T>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
  const fail = (msg: string) => Promise.reject(new Error(msg));

  const log = (loanId: string, actor: string, kind: LoanEventKind, body: string | null, notify: string | null) => {
    const text = body?.trim() || null;
    state.events.push({ id: uuid(), loan_id: loanId, actor_id: actor, kind, body: text, created_at: now() });
    if (notify && notify !== actor) {
      state.notifications.unshift({
        id: uuid(), user_id: notify, actor_id: actor, loan_id: loanId, kind: `loan_${kind}`, body: text,
        read_at: null, created_at: now(),
      });
    }
  };

  const loanById = (id: string) => {
    const loan = state.loans.find((l) => l.id === id);
    if (!loan) throw new Error('That loan no longer exists');
    return loan;
  };

  const activate = (loan: Loan, actor: string, due: string | null) => {
    if (state.loans.some((l) => l.item_id === loan.item_id && l.status === 'active' && l.id !== loan.id)) {
      throw new Error('This copy is already lent out — mark it returned first');
    }
    Object.assign(loan, { status: 'active', responded_at: loan.responded_at ?? now(), lent_at: now(), due_at: due, updated_at: now() });
    for (const other of state.loans.filter((l) => l.item_id === loan.item_id && l.status === 'pending' && l.id !== loan.id)) {
      Object.assign(other, { status: 'declined', responded_at: now(), updated_at: now() });
      log(other.id, actor, 'declined', 'This copy was lent to someone else. Try again once it is returned!', other.borrower_id);
    }
  };

  const run = <T>(fn: () => T, ...tables: Table[]): Promise<T> => {
    try {
      const result = fn();
      save(...tables);
      return delay(result, 180);
    } catch (e) {
      return Promise.reject(e);
    }
  };

  // Keep several open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY && e.newValue) {
      state = JSON.parse(e.newValue);
      (['profiles', 'games', 'library_items', 'loans', 'loan_events', 'notifications', 'invites'] as Table[]).forEach((t) =>
        listeners.forEach((l) => l(t)),
      );
    }
    if (e.key === SESSION_KEY) authListeners.forEach((l) => l(getSession()));
  });

  return {
    mode: 'demo',

    getSession: () => delay(getSession(), 0),
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    sendLoginCode(email) {
      const e = email.trim().toLowerCase();
      if (!state.invites.some((i) => i.email === e)) {
        return fail("This email isn't on the invite list. Ask a family admin to invite you.");
      }
      return delay(undefined, 500);
    },
    verifyLoginCode(email, code) {
      const e = email.trim().toLowerCase();
      if (!/^\d{6}$/.test(code.trim())) return fail('Enter the 6-digit code.');
      if (!state.invites.some((i) => i.email === e)) return fail("This email isn't on the invite list.");
      let profile = state.profiles.find((p) => p.email === e);
      if (!profile) {
        const name = e.split('@')[0].replace(/[._+-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        profile = {
          id: `p-${uuid().slice(0, 8)}`, email: e, display_name: name, nickname: name.split(' ')[0],
          avatar_url: null, avatar_icon: '⭐', accent_color: '#ff8c00', bio: null, friend_code: null,
          email_notifications: true, created_at: now(), updated_at: now(),
        };
        state.profiles.push(profile);
        save('profiles');
      }
      const session = { userId: profile.id, email: e };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      authListeners.forEach((l) => l(session));
      return delay(undefined, 400);
    },
    signInWithGoogle: () => fail('Google sign-in is not available in demo mode.'),
    async signOut() {
      localStorage.removeItem(SESSION_KEY);
      authListeners.forEach((l) => l(null));
    },

    getMembership() {
      const s = getSession();
      const invite = s && state.invites.find((i) => i.email === s.email);
      return delay({ member: !!invite, admin: !!invite?.is_admin }, 0);
    },

    listProfiles: () => delay([...state.profiles].sort((a, b) => a.display_name.localeCompare(b.display_name))),
    listGames: () => delay(state.games),
    listLibrary: () => delay([...state.library].sort((a, b) => b.created_at.localeCompare(a.created_at))),
    listLoans: () => delay([...state.loans].sort((a, b) => b.created_at.localeCompare(a.created_at))),
    listLoanEvents: (loanId) =>
      delay(state.events.filter((e) => e.loan_id === loanId).sort((a, b) => a.created_at.localeCompare(b.created_at))),
    listNotifications() {
      const s = getSession();
      return delay(s ? state.notifications.filter((n) => n.user_id === s.userId).slice(0, 60) : []);
    },
    listInvites: () => delay(state.invites),

    updateMyProfile: (patch) =>
      run(() => {
        const p = state.profiles.find((x) => x.id === me())!;
        if (patch.friend_code && !/^SW-\d{4}-\d{4}-\d{4}$/.test(patch.friend_code)) {
          throw new Error('Friend codes look like SW-1234-5678-9012');
        }
        Object.assign(p, patch, { updated_at: now() });
      }, 'profiles'),
    uploadAvatar(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read that image'));
        reader.readAsDataURL(file);
      });
    },

    addToLibrary: (game, opts) =>
      run(() => {
        const owner = me();
        let gameId: string;
        if ('id' in game) {
          gameId = game.id;
        } else {
          const existing = game.nsuid ? state.games.find((g) => g.nsuid === game.nsuid) : undefined;
          if (existing) gameId = existing.id;
          else {
            gameId = uuid();
            state.games.push({
              ...game, id: gameId, source: game.nsuid ? 'nintendo' : 'manual', created_by: owner, created_at: now(),
            });
          }
        }
        const id = uuid();
        state.library.unshift({
          id, owner_id: owner, game_id: gameId, format: opts.format, condition: opts.condition ?? null,
          notes: opts.notes?.trim() || null, lendable: true, created_at: now(),
        });
        return id;
      }, 'games', 'library_items'),
    updateLibraryItem: (id, patch) =>
      run(() => {
        const item = state.library.find((i) => i.id === id && i.owner_id === me());
        if (!item) throw new Error("You don't have permission to do that.");
        Object.assign(item, patch);
      }, 'library_items'),
    removeLibraryItem: (id) =>
      run(() => {
        const owner = me();
        const item = state.library.find((i) => i.id === id && i.owner_id === owner);
        if (!item) throw new Error("You don't have permission to do that.");
        if (state.loans.some((l) => l.item_id === id && l.status === 'active')) {
          throw new Error('This game is currently lent out — mark it returned first');
        }
        for (const l of state.loans.filter((x) => x.item_id === id && x.status === 'pending')) {
          Object.assign(l, { status: 'cancelled', responded_at: now() });
          log(l.id, owner, 'cancelled', 'The owner removed this game from their library.', l.borrower_id);
        }
        state.loans.forEach((l) => {
          if (l.item_id === id) l.item_id = null;
        });
        state.library = state.library.filter((i) => i.id !== id);
      }, 'library_items', 'loans', 'notifications'),

    requestLoan: (itemId, message) =>
      run(() => {
        const borrower = me();
        const item = state.library.find((i) => i.id === itemId);
        if (!item) throw new Error('That game is no longer in the library');
        if (item.owner_id === borrower) throw new Error('You already own this copy');
        if (!item.lendable) throw new Error('The owner is not lending this game right now');
        if (state.loans.some((l) => l.item_id === itemId && l.borrower_id === borrower && ['pending', 'active'].includes(l.status))) {
          throw new Error('You already have an open request for this game');
        }
        const loan: Loan = {
          id: uuid(), item_id: itemId, game_id: item.game_id, lender_id: item.owner_id, borrower_id: borrower,
          status: 'pending', request_message: message.trim() || null, due_at: null, requested_at: now(),
          responded_at: null, lent_at: null, returned_at: null, created_at: now(), updated_at: now(),
        };
        state.loans.unshift(loan);
        log(loan.id, borrower, 'requested', message, item.owner_id);
        return loan.id;
      }, 'loans', 'loan_events', 'notifications'),
    respondToLoan: (loanId, accept, message, due) =>
      run(() => {
        const actor = me();
        const loan = loanById(loanId);
        if (loan.lender_id !== actor) throw new Error('Only the owner can answer this request');
        if (loan.status !== 'pending') throw new Error('This request was already answered');
        if (accept) {
          activate(loan, actor, due);
          log(loan.id, actor, 'accepted', message, loan.borrower_id);
        } else {
          Object.assign(loan, { status: 'declined', responded_at: now(), updated_at: now() });
          log(loan.id, actor, 'declined', message, loan.borrower_id);
        }
      }, 'loans', 'loan_events', 'notifications'),
    cancelLoanRequest: (loanId, message) =>
      run(() => {
        const actor = me();
        const loan = loanById(loanId);
        if (loan.borrower_id !== actor) throw new Error('Only the person who asked can cancel');
        if (loan.status !== 'pending') throw new Error('This request was already answered');
        Object.assign(loan, { status: 'cancelled', responded_at: now(), updated_at: now() });
        log(loan.id, actor, 'cancelled', message, loan.lender_id);
      }, 'loans', 'loan_events', 'notifications'),
    lendGame: (itemId, borrowerId, due, message) =>
      run(() => {
        const actor = me();
        const item = state.library.find((i) => i.id === itemId);
        if (!item || item.owner_id !== actor) throw new Error('You can only lend your own games');
        if (borrowerId === actor) throw new Error('Pick someone else');
        const pending = state.loans.find((l) => l.item_id === itemId && l.borrower_id === borrowerId && l.status === 'pending');
        if (pending) {
          activate(pending, actor, due);
          log(pending.id, actor, 'accepted', message, borrowerId);
          return pending.id;
        }
        if (state.loans.some((l) => l.item_id === itemId && l.status === 'active')) {
          throw new Error('This copy is already lent out — mark it returned first');
        }
        const loan: Loan = {
          id: uuid(), item_id: itemId, game_id: item.game_id, lender_id: actor, borrower_id: borrowerId,
          status: 'pending', request_message: null, due_at: due, requested_at: null, responded_at: now(),
          lent_at: now(), returned_at: null, created_at: now(), updated_at: now(),
        };
        state.loans.unshift(loan);
        activate(loan, actor, due);
        log(loan.id, actor, 'lent', message, borrowerId);
        return loan.id;
      }, 'loans', 'loan_events', 'notifications'),
    markReturned: (loanId, message) =>
      run(() => {
        const actor = me();
        const loan = loanById(loanId);
        if (![loan.lender_id, loan.borrower_id].includes(actor)) throw new Error("You don't have permission to do that.");
        if (loan.status !== 'active') throw new Error('This game is not currently lent out');
        Object.assign(loan, { status: 'returned', returned_at: now(), updated_at: now() });
        log(loan.id, actor, 'returned', message, actor === loan.lender_id ? loan.borrower_id : loan.lender_id);
      }, 'loans', 'loan_events', 'notifications'),
    setLoanDue: (loanId, due) =>
      run(() => {
        const actor = me();
        const loan = loanById(loanId);
        if (loan.lender_id !== actor) throw new Error('Only the owner can change the due date');
        loan.due_at = due;
        const label = due
          ? 'Due ' + new Date(due + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : 'No due date';
        log(loan.id, actor, 'due_changed', label, loan.borrower_id);
      }, 'loans', 'loan_events', 'notifications'),
    commentOnLoan: (loanId, body) =>
      run(() => {
        const actor = me();
        const loan = loanById(loanId);
        if (!body.trim()) throw new Error('Write something first');
        if (![loan.lender_id, loan.borrower_id].includes(actor)) {
          throw new Error('Only the two people involved can comment');
        }
        log(loan.id, actor, 'comment', body, actor === loan.lender_id ? loan.borrower_id : loan.lender_id);
      }, 'loan_events', 'notifications'),

    markNotificationsRead: (ids) =>
      run(() => {
        const s = getSession();
        state.notifications.forEach((n) => {
          if (n.user_id === s?.userId && !n.read_at && (!ids || ids.includes(n.id))) n.read_at = now();
        });
      }, 'notifications'),
    flushEmails: async () => {},

    async recognizeGames() {
      await new Promise((r) => setTimeout(r, 1600));
      return [
        { title: 'Mario Kart 8 Deluxe', platform: 'Nintendo Switch', confidence: 0.97 },
        { title: 'Celeste', platform: 'Nintendo Switch', confidence: 0.88 },
        { title: 'Super Mario Party Jamboree', platform: 'Nintendo Switch', confidence: 0.81 },
      ];
    },

    addInvite: (email, isAdmin, note) =>
      run(() => {
        const e = email.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('That does not look like an email address');
        const inv = state.invites.find((i) => i.email === getSession()?.email);
        if (!inv?.is_admin) throw new Error("You don't have permission to do that.");
        if (state.invites.some((i) => i.email === e)) throw new Error('That email is already invited.');
        state.invites.push({ email: e, is_admin: isAdmin, note: note.trim() || null, invited_by: me(), created_at: now() });
      }, 'invites'),
    removeInvite: (email) =>
      run(() => {
        const s = getSession();
        if (!state.invites.find((i) => i.email === s?.email)?.is_admin) throw new Error("You don't have permission to do that.");
        if (email === s?.email) throw new Error("You can't remove yourself.");
        state.invites = state.invites.filter((i) => i.email !== email);
      }, 'invites'),
    setInviteAdmin: (email, isAdmin) =>
      run(() => {
        const s = getSession();
        if (!state.invites.find((i) => i.email === s?.email)?.is_admin) throw new Error("You don't have permission to do that.");
        const inv = state.invites.find((i) => i.email === email);
        if (inv) inv.is_admin = isAdmin;
      }, 'invites'),

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
