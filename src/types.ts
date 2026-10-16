export interface Profile {
  id: string;
  email: string;
  display_name: string;
  nickname: string | null;
  avatar_url: string | null;
  avatar_icon: string | null;
  accent_color: string;
  bio: string | null;
  friend_code: string | null;
  email_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export type ProfilePatch = Partial<
  Pick<
    Profile,
    | 'display_name'
    | 'nickname'
    | 'avatar_url'
    | 'avatar_icon'
    | 'accent_color'
    | 'bio'
    | 'friend_code'
    | 'email_notifications'
  >
>;

export interface Game {
  id: string;
  nsuid: string | null;
  title: string;
  icon_url: string | null;
  hero_url: string | null;
  platform: string | null;
  publisher: string | null;
  developer: string | null;
  release_date: string | null;
  genres: string[];
  player_count: string | null;
  max_players: number | null;
  multiplayer: boolean | null;
  local_multiplayer: boolean | null;
  online_multiplayer: boolean | null;
  coop: boolean | null;
  play_modes: string[];
  features: string[];
  ways_to_play: string[];
  esrb_rating: string | null;
  description: string | null;
  store_url: string | null;
  source: 'nintendo' | 'manual';
  created_by: string | null;
  created_at: string;
}

/** A game as it comes from the catalog or the manual form (not yet stored). */
export type GameInput = Omit<Game, 'id' | 'source' | 'created_by' | 'created_at'>;

export type GameFormat = 'physical' | 'digital';
export type GameCondition = 'mint' | 'good' | 'fair' | 'worn';

export interface LibraryItem {
  id: string;
  owner_id: string;
  game_id: string;
  format: GameFormat;
  condition: GameCondition | null;
  notes: string | null;
  lendable: boolean;
  created_at: string;
}

export type LibraryItemPatch = Partial<Pick<LibraryItem, 'format' | 'condition' | 'notes' | 'lendable'>>;

export type LoanStatus = 'pending' | 'declined' | 'cancelled' | 'active' | 'returned';

export interface Loan {
  id: string;
  item_id: string | null;
  game_id: string;
  lender_id: string;
  borrower_id: string;
  status: LoanStatus;
  request_message: string | null;
  due_at: string | null;
  requested_at: string | null;
  responded_at: string | null;
  lent_at: string | null;
  returned_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LoanEventKind =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'lent'
  | 'returned'
  | 'comment'
  | 'due_changed';

export interface LoanEvent {
  id: string;
  loan_id: string;
  actor_id: string | null;
  kind: LoanEventKind;
  body: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  loan_id: string | null;
  kind: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Invite {
  email: string;
  is_admin: boolean;
  note: string | null;
  invited_by: string | null;
  created_at: string;
}

export interface DetectedGame {
  title: string;
  platform: string | null;
  confidence: number;
}

export interface Session {
  userId: string;
  email: string;
}
