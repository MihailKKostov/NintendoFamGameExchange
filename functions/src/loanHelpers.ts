import type { Transaction } from 'firebase-admin/firestore';
import { db, now } from './common.js';

export type EventKind = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'lent' | 'returned' | 'comment' | 'due_changed';

export function logEvent(tx: Transaction, fid: string, loanId: string, actorId: string, kind: EventKind, body: string | null) {
  tx.create(db.collection(`families/${fid}/loans/${loanId}/events`).doc(), {
    loan_id: loanId,
    actor_id: actorId,
    kind,
    body: body?.trim() ? body.trim().slice(0, 2000) : null,
    created_at: now(),
  });
}

export interface NotifyInput {
  userId: string;
  familyId: string;
  actorId: string;
  actorName: string;
  kind: string;
  body: string | null;
  loanId: string | null;
  gameTitle: string | null;
  gameIcon: string | null;
}

/** In-app notification; the onNotificationCreated trigger turns it into an email. */
export function notify(tx: Transaction, n: NotifyInput) {
  if (n.userId === n.actorId) return;
  tx.create(db.collection(`users/${n.userId}/notifications`).doc(), {
    family_id: n.familyId,
    actor_id: n.actorId,
    actor_name: n.actorName,
    loan_id: n.loanId,
    game_title: n.gameTitle,
    game_icon: n.gameIcon,
    kind: n.kind,
    body: n.body?.trim() ? n.body.trim().slice(0, 500) : null,
    read_at: null,
    created_at: now(),
  });
}
