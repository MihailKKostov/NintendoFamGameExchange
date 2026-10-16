import type {
  AppNotification, DetectedGame, Game, GameFormat, GameCondition, GameInput, Invite, LibraryItem,
  LibraryItemPatch, Loan, LoanEvent, Profile, ProfilePatch, Session,
} from '../types';

export type Table = 'profiles' | 'games' | 'library_items' | 'loans' | 'loan_events' | 'notifications' | 'invites';

export interface AddToLibraryOptions {
  format: GameFormat;
  condition?: GameCondition | null;
  notes?: string | null;
}

/** Everything the UI needs from a backend. Implemented by Supabase and by the in-browser demo. */
export interface Api {
  readonly mode: 'supabase' | 'demo';

  // auth
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (session: Session | null) => void): () => void;
  sendLoginCode(email: string): Promise<void>;
  verifyLoginCode(email: string, code: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;

  // membership
  getMembership(): Promise<{ member: boolean; admin: boolean }>;

  // reads
  listProfiles(): Promise<Profile[]>;
  listGames(): Promise<Game[]>;
  listLibrary(): Promise<LibraryItem[]>;
  listLoans(): Promise<Loan[]>;
  listLoanEvents(loanId: string): Promise<LoanEvent[]>;
  listNotifications(): Promise<AppNotification[]>;
  listInvites(): Promise<Invite[]>;

  // profile
  updateMyProfile(patch: ProfilePatch): Promise<void>;
  uploadAvatar(file: Blob): Promise<string>;

  // library
  addToLibrary(game: GameInput | { id: string }, opts: AddToLibraryOptions): Promise<string>;
  updateLibraryItem(id: string, patch: LibraryItemPatch): Promise<void>;
  removeLibraryItem(id: string): Promise<void>;

  // loans
  requestLoan(itemId: string, message: string): Promise<string>;
  respondToLoan(loanId: string, accept: boolean, message: string, due: string | null): Promise<void>;
  cancelLoanRequest(loanId: string, message: string): Promise<void>;
  lendGame(itemId: string, borrowerId: string, due: string | null, message: string): Promise<string>;
  markReturned(loanId: string, message: string): Promise<void>;
  setLoanDue(loanId: string, due: string | null): Promise<void>;
  commentOnLoan(loanId: string, body: string): Promise<void>;

  // notifications
  markNotificationsRead(ids?: string[]): Promise<void>;
  /** Ask the server to send any queued emails. Never throws. */
  flushEmails(): Promise<void>;

  // screenshot recognition
  recognizeGames(imageDataUrl: string): Promise<DetectedGame[]>;

  // admin
  addInvite(email: string, isAdmin: boolean, note: string): Promise<void>;
  removeInvite(email: string): Promise<void>;
  setInviteAdmin(email: string, isAdmin: boolean): Promise<void>;

  /** Live updates: called with the table that changed. */
  subscribe(onChange: (table: Table) => void): () => void;
}
