import type {
  AppNotification, Family, FamilyInput, Game, GameCondition, GameFormat, GameInput, GameOpinionPatch, GameRating, Invite, LibraryItem,
  LibraryItemPatch, Loan, LoanEvent, Member, Profile, ProfilePatch, Role, Session,
} from '../types';

/** Things the UI can subscribe to; `onChange` tells which one changed. */
export type Table =
  | 'me' | 'families' | 'my_invites' | 'notifications'
  | 'members' | 'games' | 'library_items' | 'loans' | 'loan_events' | 'family_invites' | 'ratings';

export interface AddToLibraryOptions {
  format: GameFormat;
  condition?: GameCondition | null;
  notes?: string | null;
}

/**
 * Everything the UI needs from a backend. Implemented by Firebase and by the
 * in-browser demo. Family-scoped calls act on the family chosen with
 * selectFamily().
 */
export interface Api {
  readonly mode: 'firebase' | 'demo';

  // --- auth -----------------------------------------------------------------
  /** Who was signed in on this device last time (instant, not yet confirmed). */
  cachedSession?(): Session | null;
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (session: Session | null) => void): () => void;
  /** Email a sign-in link. */
  sendLoginLink(email: string): Promise<void>;
  /** True when the current URL is a sign-in link from that email. */
  isLoginLink(): boolean;
  /** Finish signing in from a link (needs the email when opened on another device). */
  completeLoginLink(email: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;

  // --- me ---------------------------------------------------------------------
  getMe(): Promise<Profile>;
  updateMyProfile(patch: ProfilePatch): Promise<void>;
  uploadAvatar(file: Blob): Promise<string>;

  // --- families -----------------------------------------------------------
  listMyFamilies(): Promise<Family[]>;
  listMyInvites(): Promise<Invite[]>;
  getInvite(inviteId: string): Promise<Invite | null>;
  createFamily(input: FamilyInput): Promise<string>;
  acceptInvite(inviteId: string): Promise<string>;
  declineInvite(inviteId: string): Promise<void>;
  selectFamily(familyId: string | null): void;

  // family management (current family)
  updateFamily(patch: Partial<FamilyInput>): Promise<void>;
  deleteFamily(): Promise<void>;
  leaveFamily(): Promise<void>;
  listFamilyInvites(): Promise<Invite[]>;
  inviteMember(email: string, role: 'admin' | 'member'): Promise<void>;
  revokeInvite(inviteId: string): Promise<void>;
  removeMember(userId: string): Promise<void>;
  setMemberRole(userId: string, role: Exclude<Role, 'owner'>): Promise<void>;

  // --- family data (current family) ---------------------------------------
  listMembers(): Promise<Member[]>;
  listGames(): Promise<Game[]>;
  listLibrary(): Promise<LibraryItem[]>;
  listLoans(): Promise<Loan[]>;
  listLoanEvents(loanId: string): Promise<LoanEvent[]>;
  listNotifications(): Promise<AppNotification[]>;
  /** Everyone's star ratings and recommendations in the current family. */
  listRatings(): Promise<GameRating[]>;

  /** Add a copy you own; returns the new copy's id and the family game it belongs to. */
  addToLibrary(game: GameInput | { id: string }, opts: AddToLibraryOptions): Promise<{ itemId: string; gameId: string }>;
  updateLibraryItem(id: string, patch: LibraryItemPatch): Promise<void>;
  removeLibraryItem(id: string): Promise<void>;
  /** Pick up to 5 of your games (current family) to show on your profile. */
  setFavoriteGames(gameIds: string[]): Promise<void>;
  /** Rate (1–5, null to clear) and/or recommend a game, as yourself, in the current family. */
  setGameOpinion(gameId: string, patch: GameOpinionPatch): Promise<void>;

  requestLoan(itemId: string, message: string): Promise<string>;
  respondToLoan(loanId: string, accept: boolean, message: string, due: string | null): Promise<void>;
  cancelLoanRequest(loanId: string, message: string): Promise<void>;
  lendGame(itemId: string, borrowerId: string, due: string | null, message: string): Promise<string>;
  markReturned(loanId: string, message: string): Promise<void>;
  setLoanDue(loanId: string, due: string | null): Promise<void>;
  commentOnLoan(loanId: string, body: string): Promise<void>;

  markNotificationsRead(ids?: string[]): Promise<void>;

  /** Live updates: called with what changed. */
  subscribe(onChange: (table: Table) => void): () => void;
}
