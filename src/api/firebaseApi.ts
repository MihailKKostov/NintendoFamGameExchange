import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, browserLocalPersistence, browserPopupRedirectResolver, browserSessionPersistence,
  connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, isSignInWithEmailLink, onAuthStateChanged,
  sendSignInLinkToEmail, signInWithEmailLink, signInWithPopup, signOut as fbSignOut, type Auth,
  type PopupRedirectResolver, type User,
} from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, initializeFirestore, limit, onSnapshot, orderBy,
  persistentLocalCache, persistentMultipleTabManager, query, setDoc, updateDoc, where, writeBatch, type DocumentData,
  type Firestore, type QuerySnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { appBaseUrl, config } from '../config';
import type {
  AppNotification, Family, Game, GameRating, Invite, LibraryItem, Loan, LoanEvent, Member, Profile, Session,
} from '../types';
import type { Api, Table } from './types';

const LOGIN_EMAIL_KEY = 'fge-login-email';
/** Who was signed in on this device last time, so the app can open before Firebase confirms it. */
const SESSION_HINT_KEY = 'fge-session';

function readSessionHint(): Session | null {
  try {
    const v = JSON.parse(localStorage.getItem(SESSION_HINT_KEY) ?? 'null') as Session | null;
    return v?.userId && typeof v.email === 'string' ? v : null;
  } catch {
    return null;
  }
}
function writeSessionHint(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_HINT_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* storage blocked */
  }
}

/** Turn Firebase errors into sentences people can act on. */
export function friendlyError(error: unknown): Error {
  const e = error as { code?: string; message?: string };
  const code = e?.code ?? '';
  const msg = String(e?.message ?? error ?? 'Something went wrong');
  if (code.startsWith('functions/') && code !== 'functions/internal' && code !== 'functions/unavailable') {
    return new Error(msg);
  }
  const map: Record<string, string> = {
    'functions/internal': 'Something went wrong on the server. Please try again.',
    'functions/unavailable': 'The server is unreachable — check your connection.',
    'permission-denied': "You don't have permission to see that.",
    unavailable: "You're offline — changes will sync when you reconnect.",
    'auth/invalid-email': 'That does not look like an email address.',
    'auth/invalid-action-code': 'That sign-in link has expired or was already used. Request a new one.',
    'auth/expired-action-code': 'That sign-in link has expired. Request a new one.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed.',
    'auth/cancelled-popup-request': 'The Google sign-in window was closed.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window — allow pop-ups and try again.',
    'auth/unauthorized-domain': 'This website is not on the Firebase project’s list of authorized domains (see README).',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in the Firebase project (see README).',
    'auth/too-many-requests': 'Too many attempts — please wait a minute and try again.',
    'auth/network-request-failed': 'Network error — check your connection.',
    'storage/unauthorized': 'That picture could not be uploaded (images up to 2 MB).',
  };
  return new Error(map[code] ?? msg.replace(/^Firebase:\s*/, '').replace(/\s*\(.*\)\.?$/, ''));
}

const rows = <T,>(snap: QuerySnapshot<DocumentData>) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);

export function createFirebaseApi(): Api {
  const app = initializeApp(config.firebase!);
  // Like getAuth(), minus the Google sign-in helper. On phones and Safari,
  // getAuth() loads Google's sign-in iframe (several scripts from two extra
  // domains) before it even reports who is signed in, delaying every page load.
  // It's only needed for "Continue with Google", so it's loaded on the sign-in
  // screen instead (see warmUpGoogleSignIn).
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
  });
  let db: Firestore;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }
  const fns = getFunctions(app, config.functionsRegion);
  if (config.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  }

  // Storage is only used for profile pictures, so it's loaded on first upload.
  let storageMod: Promise<{ mod: typeof import('firebase/storage'); storage: import('firebase/storage').FirebaseStorage }> | null = null;
  const loadStorage = () =>
    (storageMod ??= import('firebase/storage').then((mod) => {
      const storage = mod.getStorage(app);
      if (config.useEmulators) mod.connectStorageEmulator(storage, '127.0.0.1', 9199);
      return { mod, storage };
    }));

  // Load Google's sign-in helper ahead of time while someone is on the sign-in
  // screen: Safari only allows the popup if it opens right away on tap, and the
  // popup waits for this helper. Firebase has no public "preload" call, so we
  // hand signInWithPopup our own instance of its resolver and initialise that
  // one early. If Firebase internals ever change, the warm-up quietly does
  // nothing and the helper loads on tap instead.
  const googleHelper = new (browserPopupRedirectResolver as unknown as new () => { _initialize?: (a: Auth) => Promise<unknown> })();
  const googleResolver = function GoogleResolver() {
    return googleHelper;
  } as unknown as PopupRedirectResolver;
  let warmedUp = false;
  const warmUpGoogleSignIn = () => {
    if (warmedUp) return;
    warmedUp = true;
    try {
      void googleHelper._initialize?.(auth)?.catch(() => undefined);
    } catch {
      /* loads on tap instead */
    }
  };

  let user: User | null = null;
  let familyId: string | null = null;

  // ------------------------------------------------------------------------
  // Live cache: one Firestore listener per thing the UI shows. list*() calls
  // resolve from the cache; later snapshots notify subscribers.
  // ------------------------------------------------------------------------
  const listeners = new Set<(t: Table) => void>();
  const emit = (t: Table) => listeners.forEach((l) => l(t));
  interface Entry {
    data: unknown;
    error?: Error;
    ready: Promise<void>;
    unsub: Unsubscribe;
    table: Table;
  }
  const cache = new Map<string, Entry>();

  function live<T>(key: string, table: Table, start: (next: (v: T) => void, fail: (e: unknown) => void) => Unsubscribe): Promise<T> {
    let entry = cache.get(key);
    if (!entry) {
      let resolve!: () => void;
      let first = true;
      const e: Entry = { data: undefined, ready: new Promise<void>((r) => (resolve = r)), unsub: () => {}, table };
      const settle = () => {
        if (first) {
          first = false;
          resolve();
        } else emit(table);
      };
      cache.set(key, e);
      e.unsub = start(
        (v) => {
          e.data = v;
          e.error = undefined;
          settle();
        },
        (err) => {
          e.error = friendlyError(err);
          settle();
          // Let the next read try again (e.g. after rejoining a family).
          cache.delete(key);
        },
      );
      entry = e;
    }
    const en = entry;
    return en.ready.then(() => {
      if (en.error) throw en.error;
      return en.data as T;
    });
  }

  function drop(prefix: string) {
    for (const [k, e] of cache) {
      if (k.startsWith(prefix)) {
        e.unsub();
        cache.delete(k);
      }
    }
  }

  /** Wait until a cached value satisfies `pred` (used after server-side writes). */
  function until<T>(read: () => Promise<T>, pred: (v: T) => boolean, ms = 15000): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        off();
        resolve();
      };
      const check = () => void read().then((v) => pred(v) && done(), () => undefined);
      const off = (() => {
        const l = () => check();
        listeners.add(l);
        return () => listeners.delete(l);
      })();
      const timer = setTimeout(done, ms);
      check();
    });
  }

  const uid = () => {
    if (!user) throw new Error('You are signed out.');
    return user.uid;
  };
  const fid = () => {
    if (!familyId) throw new Error('Pick a family first.');
    return familyId;
  };
  const call = async <T = unknown,>(name: string, data: Record<string, unknown> = {}): Promise<T> => {
    try {
      return (await httpsCallable(fns, name)(data)).data as T;
    } catch (e) {
      throw friendlyError(e);
    }
  };
  const famCall = <T = unknown,>(name: string, data: Record<string, unknown> = {}) => call<T>(name, { familyId: fid(), ...data });

  const toSession = (u: User | null): Session | null => (u ? { userId: u.uid, email: (u.email ?? '').toLowerCase() } : null);

  // Firebase checks the saved sign-in with Google before reporting it (two
  // round trips once the token has expired). The app opens straight away from
  // the session hint; every data call waits here until that check is done.
  const ready = auth.authStateReady().then(() => {
    user = auth.currentUser;
  });
  onAuthStateChanged(auth, (u) => writeSessionHint(toSession(u)));

  const ratings = () => {
    const f = fid();
    return live<GameRating[]>(`f:${f}:ratings`, 'ratings', (next, fail) =>
      onSnapshot(collection(db, `families/${f}/ratings`), (s) => next(rows<GameRating>(s)), fail),
    );
  };

  const myFamilies = () =>
    live<Family[]>(`u:${uid()}:families`, 'families', (next, fail) =>
      onSnapshot(query(collection(db, 'families'), where('member_ids', 'array-contains', uid())), (s) =>
        next(rows<Family>(s).sort((a, b) => a.created_at.localeCompare(b.created_at))), fail),
    );

  const api: Api = {
    mode: 'firebase',
    cachedSession: readSessionHint,

    // --- auth ---------------------------------------------------------------
    async getSession() {
      await auth.authStateReady();
      user = auth.currentUser;
      if (!user) warmUpGoogleSignIn();
      return toSession(user);
    },
    onAuthChange(cb) {
      return onAuthStateChanged(auth, (u) => {
        if (user && (!u || u.uid !== user.uid)) {
          drop('');
          familyId = null;
        }
        user = u;
        if (!u) warmUpGoogleSignIn();
        cb(toSession(u));
      });
    },
    async sendLoginLink(email) {
      const addr = email.trim().toLowerCase();
      try {
        await sendSignInLinkToEmail(auth, addr, { url: appBaseUrl(), handleCodeInApp: true });
        localStorage.setItem(LOGIN_EMAIL_KEY, addr);
      } catch (e) {
        throw friendlyError(e);
      }
    },
    isLoginLink: () => isSignInWithEmailLink(auth, window.location.href),
    async completeLoginLink(email) {
      try {
        await signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href);
        localStorage.removeItem(LOGIN_EMAIL_KEY);
      } catch (e) {
        throw friendlyError(e);
      } finally {
        // Strip ?apiKey=…&oobCode=… but keep the #/route.
        if (window.location.search) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
    },
    async signInWithGoogle() {
      try {
        await signInWithPopup(auth, new GoogleAuthProvider(), googleResolver);
      } catch (e) {
        throw friendlyError(e);
      }
    },
    async signOut() {
      drop('');
      familyId = null;
      await fbSignOut(auth);
    },

    // --- me -------------------------------------------------------------------
    async getMe() {
      const me = uid();
      const read = () =>
        live<Profile | null>(`u:${me}:me`, 'me', (next, fail) =>
          onSnapshot(doc(db, 'users', me), (s) => next(s.exists() ? ({ id: s.id, ...s.data() } as Profile) : null), fail),
        );
      let profile = await read();
      if (!profile) {
        await call('ensureUser');
        const snap = await getDoc(doc(db, 'users', me));
        profile = { id: snap.id, ...snap.data() } as Profile;
      }
      return profile;
    },
    updateMyProfile: (patch) => call('updateProfile', patch as Record<string, unknown>).then(() => {}),
    async uploadAvatar(file) {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      try {
        const { mod, storage } = await loadStorage();
        const r = mod.ref(storage, `avatars/${uid()}/${Date.now()}.${ext}`);
        await mod.uploadBytes(r, file, { contentType: file.type || 'image/jpeg', cacheControl: 'public, max-age=31536000' });
        return await mod.getDownloadURL(r);
      } catch (e) {
        throw friendlyError(e);
      }
    },

    // --- families ---------------------------------------------------------------
    listMyFamilies: myFamilies,
    listMyInvites() {
      const me = user;
      if (!me?.email) return Promise.resolve([]);
      return live<Invite[]>(`u:${me.uid}:invites`, 'my_invites', (next, fail) =>
        onSnapshot(
          query(collection(db, 'invites'), where('email', '==', me.email!.toLowerCase()), where('status', '==', 'pending')),
          (s) => next(rows<Invite>(s)),
          fail,
        ),
      );
    },
    async getInvite(inviteId) {
      try {
        const s = await getDoc(doc(db, 'invites', inviteId));
        return s.exists() ? ({ id: s.id, ...s.data() } as Invite) : null;
      } catch {
        return null;
      }
    },
    async createFamily(input) {
      const { familyId: id } = await call<{ familyId: string }>('createFamily', { ...input });
      await until(myFamilies, (fs) => fs.some((f) => f.id === id));
      return id;
    },
    async acceptInvite(inviteId) {
      const { familyId: id } = await call<{ familyId: string }>('acceptInvite', { inviteId });
      await until(myFamilies, (fs) => fs.some((f) => f.id === id));
      return id;
    },
    declineInvite: (inviteId) => call('declineInvite', { inviteId }).then(() => {}),
    selectFamily(id) {
      if (id === familyId) return;
      if (familyId) drop(`f:${familyId}:`);
      familyId = id;
    },

    updateFamily: (patch) => famCall('updateFamily', patch).then(() => {}),
    async deleteFamily() {
      const id = fid();
      await famCall('deleteFamily');
      drop(`f:${id}:`);
      await until(myFamilies, (fs) => !fs.some((f) => f.id === id));
    },
    async leaveFamily() {
      const id = fid();
      await famCall('removeMember');
      drop(`f:${id}:`);
      await until(myFamilies, (fs) => !fs.some((f) => f.id === id));
    },
    listFamilyInvites() {
      const f = fid();
      return live<Invite[]>(`f:${f}:invites`, 'family_invites', (next, fail) =>
        onSnapshot(
          query(collection(db, 'invites'), where('family_id', '==', f), where('status', '==', 'pending')),
          (s) => next(rows<Invite>(s).sort((a, b) => a.created_at.localeCompare(b.created_at))),
          fail,
        ),
      );
    },
    inviteMember: (email, role) => famCall('inviteMember', { email, role }).then(() => {}),
    revokeInvite: (inviteId) => call('revokeInvite', { inviteId }).then(() => {}),
    removeMember: (userId) => famCall('removeMember', { userId }).then(() => {}),
    setMemberRole: (userId, role) => famCall('setMemberRole', { userId, role }).then(() => {}),

    // --- family data ------------------------------------------------------------
    listMembers() {
      const f = fid();
      return live<Member[]>(`f:${f}:members`, 'members', (next, fail) =>
        onSnapshot(collection(db, `families/${f}/members`), (s) =>
          next(rows<Member>(s).sort((a, b) => a.display_name.localeCompare(b.display_name))), fail),
      );
    },
    listGames() {
      const f = fid();
      return live<Game[]>(`f:${f}:games`, 'games', (next, fail) =>
        onSnapshot(collection(db, `families/${f}/games`), (s) => next(rows<Game>(s)), fail),
      );
    },
    listLibrary() {
      const f = fid();
      return live<LibraryItem[]>(`f:${f}:items`, 'library_items', (next, fail) =>
        onSnapshot(collection(db, `families/${f}/items`), (s) =>
          next(rows<LibraryItem>(s).sort((a, b) => b.created_at.localeCompare(a.created_at))), fail),
      );
    },
    listLoans() {
      const f = fid();
      return live<Loan[]>(`f:${f}:loans`, 'loans', (next, fail) =>
        onSnapshot(collection(db, `families/${f}/loans`), (s) =>
          next(rows<Loan>(s).sort((a, b) => b.created_at.localeCompare(a.created_at))), fail),
      );
    },
    listLoanEvents(loanId) {
      const f = fid();
      return live<LoanEvent[]>(`f:${f}:events:${loanId}`, 'loan_events', (next, fail) =>
        onSnapshot(collection(db, `families/${f}/loans/${loanId}/events`), (s) =>
          next(rows<LoanEvent>(s).sort((a, b) => a.created_at.localeCompare(b.created_at))), fail),
      );
    },
    listRatings: ratings,
    listNotifications() {
      const me = uid();
      return live<AppNotification[]>(`u:${me}:notifications`, 'notifications', (next, fail) =>
        onSnapshot(
          query(collection(db, `users/${me}/notifications`), orderBy('created_at', 'desc'), limit(60)),
          (s) => next(rows<AppNotification>(s)),
          fail,
        ),
      );
    },

    addToLibrary: (game, opts) =>
      famCall<{ itemId: string; gameId: string }>('addToLibrary', { game, format: opts.format, condition: opts.condition ?? null, notes: opts.notes ?? null })
        .then((r) => ({ itemId: r.itemId, gameId: r.gameId })),
    async updateLibraryItem(id, patch) {
      try {
        await updateDoc(doc(db, `families/${fid()}/items/${id}`), patch);
      } catch (e) {
        throw friendlyError(e);
      }
    },
    removeLibraryItem: (itemId) => famCall('removeLibraryItem', { itemId }).then(() => {}),
    async setFavoriteGames(gameIds) {
      try {
        await updateDoc(doc(db, `families/${fid()}/members/${uid()}`), { favorite_game_ids: [...new Set(gameIds)].slice(0, 5) });
      } catch (e) {
        throw friendlyError(e);
      }
    },

    async setGameOpinion(gameId, patch) {
      const f = fid();
      const me = uid();
      const id = `${me}_${gameId}`;
      const current = (await ratings()).find((r) => r.id === id);
      const rating = patch.rating !== undefined ? patch.rating : (current?.rating ?? null);
      const recommended = patch.recommended ?? current?.recommended ?? false;
      if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new Error('Ratings go from 1 to 5 stars.');
      const ref = doc(db, `families/${f}/ratings/${id}`);
      try {
        // Nothing left to say about the game: remove the record.
        if (rating === null && !recommended) await deleteDoc(ref);
        else await setDoc(ref, { user_id: me, game_id: gameId, rating, recommended, updated_at: new Date().toISOString() });
      } catch (e) {
        throw friendlyError(e);
      }
    },

    requestLoan: (itemId, message) => famCall<{ loanId: string }>('requestLoan', { itemId, message }).then((r) => r.loanId),
    respondToLoan: (loanId, accept, message, due) => famCall('respondToLoan', { loanId, accept, message, due }).then(() => {}),
    cancelLoanRequest: (loanId, message) => famCall('cancelLoanRequest', { loanId, message }).then(() => {}),
    lendGame: (itemId, borrowerId, due, message) =>
      famCall<{ loanId: string }>('lendGame', { itemId, borrowerId, due, message }).then((r) => r.loanId),
    markReturned: (loanId, message) => famCall('markLoanReturned', { loanId, message }).then(() => {}),
    setLoanDue: (loanId, due) => famCall('setLoanDue', { loanId, due }).then(() => {}),
    commentOnLoan: (loanId, body) => famCall('commentOnLoan', { loanId, body }).then(() => {}),

    async markNotificationsRead(ids) {
      const me = uid();
      const all = (cache.get(`u:${me}:notifications`)?.data as AppNotification[] | undefined) ?? [];
      const targets = all.filter((n) => !n.read_at && (!ids || ids.includes(n.id)));
      if (!targets.length) return;
      const batch = writeBatch(db);
      const at = new Date().toISOString();
      targets.forEach((n) => batch.update(doc(db, `users/${me}/notifications/${n.id}`), { read_at: at }));
      try {
        await batch.commit();
      } catch (e) {
        throw friendlyError(e);
      }
    },

    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };

  // Everything that reads or writes data waits for the sign-in check.
  const noWait = new Set<string>([
    'mode', 'cachedSession', 'getSession', 'onAuthChange', 'sendLoginLink', 'isLoginLink', 'completeLoginLink',
    'signInWithGoogle', 'signOut', 'selectFamily', 'subscribe',
  ]);
  const wrapped = { ...api } as Record<string, unknown>;
  for (const [name, fn] of Object.entries(api)) {
    if (typeof fn === 'function' && !noWait.has(name)) {
      wrapped[name] = (...args: unknown[]) => ready.then(() => (fn as (...a: unknown[]) => unknown)(...args));
    }
  }
  return wrapped as unknown as Api;
}

/** The email a sign-in link was requested for on this device, if any. */
export const rememberedLoginEmail = () => {
  try {
    return localStorage.getItem(LOGIN_EMAIL_KEY);
  } catch {
    return null;
  }
};
