import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { dateOrNull, db, fail, id, loadFamily, nameOf, now, requireAuth, str } from './common.js';
import { logEvent, notify, type EventKind } from './loanHelpers.js';

interface Ctx {
  tx: Transaction;
  fid: string;
  uid: string;
  actorName: string;
}

const loansCol = (fid: string) => db.collection(`families/${fid}/loans`);

async function gameInfo(tx: Transaction, fid: string, gameId: string) {
  const g = await tx.get(db.doc(`families/${fid}/games/${gameId}`));
  return { gameTitle: (g.get('title') as string) ?? null, gameIcon: (g.get('icon_url') as string) ?? null };
}

/** Everything a loan action needs, read up front (Firestore transactions read before they write). */
async function begin(tx: Transaction, data: Record<string, unknown>, uid: string) {
  const fid = id(data.familyId, 'family');
  await loadFamily(fid, uid, tx);
  const actorName = await nameOf(fid, uid, tx);
  return { tx, fid, uid, actorName } as Ctx;
}

async function getLoan(ctx: Ctx, loanId: unknown) {
  const ref = loansCol(ctx.fid).doc(id(loanId, 'loan'));
  const snap = await ctx.tx.get(ref);
  if (!snap.exists) fail('not-found', 'That loan no longer exists.');
  return snap;
}

function record(ctx: Ctx, loan: DocumentSnapshot, kind: EventKind, body: string | null, notifyUser: string | null, game: { gameTitle: string | null; gameIcon: string | null }) {
  logEvent(ctx.tx, ctx.fid, loan.id, ctx.uid, kind, body);
  if (notifyUser) {
    notify(ctx.tx, {
      userId: notifyUser, familyId: ctx.fid, actorId: ctx.uid, actorName: ctx.actorName, kind: `loan_${kind}`, body,
      loanId: loan.id, ...game,
    });
  }
}

/** Reads needed to activate a loan: other open loans on the same copy. */
async function readActivation(ctx: Ctx, itemId: string, loanId: string | null) {
  const open = await ctx.tx.get(loansCol(ctx.fid).where('item_id', '==', itemId).where('status', 'in', ['pending', 'active']));
  if (open.docs.some((d) => d.get('status') === 'active' && d.id !== loanId)) {
    fail('failed-precondition', 'This copy is already lent out — mark it returned first.');
  }
  return open.docs.filter((d) => d.get('status') === 'pending' && d.id !== loanId);
}

/** Writes: decline every other pending request for the copy. */
function declineOthers(ctx: Ctx, others: DocumentSnapshot[], game: { gameTitle: string | null; gameIcon: string | null }) {
  for (const other of others) {
    ctx.tx.update(other.ref, { status: 'declined', responded_at: now(), updated_at: now() });
    record(ctx, other, 'declined', 'This copy was lent to someone else. Try again once it is returned!', other.get('borrower_id'), game);
  }
}

const message = (v: unknown) => str(v, 'Message', { max: 1000, optional: true });

export const requestLoan = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const msg = message(d.message);
  return db.runTransaction(async (tx) => {
    const ctx = await begin(tx, d, uid);
    const itemRef = db.doc(`families/${ctx.fid}/items/${id(d.itemId, 'item')}`);
    const item = await tx.get(itemRef);
    if (!item.exists) fail('not-found', 'That game is no longer in the library.');
    if (item.get('owner_id') === uid) fail('failed-precondition', 'You already own this copy.');
    if (!item.get('lendable')) fail('failed-precondition', 'The owner is not lending this game right now.');
    const mine = await tx.get(
      loansCol(ctx.fid).where('item_id', '==', item.id).where('borrower_id', '==', uid).where('status', 'in', ['pending', 'active']),
    );
    if (!mine.empty) fail('already-exists', 'You already have an open request for this game.');
    const game = await gameInfo(tx, ctx.fid, item.get('game_id'));

    const ref = loansCol(ctx.fid).doc();
    tx.create(ref, {
      item_id: item.id, game_id: item.get('game_id'), lender_id: item.get('owner_id'), borrower_id: uid, status: 'pending',
      request_message: msg, due_at: null, requested_at: now(), responded_at: null, lent_at: null, returned_at: null,
      created_at: now(), updated_at: now(),
    });
    record(ctx, { id: ref.id } as DocumentSnapshot, 'requested', msg, item.get('owner_id'), game);
    return { loanId: ref.id };
  });
});

export const respondToLoan = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const accept = d.accept === true;
  const msg = message(d.message);
  const due = accept ? dateOrNull(d.due) : null;
  return db.runTransaction(async (tx) => {
    const ctx = await begin(tx, d, uid);
    const loan = await getLoan(ctx, d.loanId);
    if (loan.get('lender_id') !== uid) fail('permission-denied', 'Only the owner can answer this request.');
    if (loan.get('status') !== 'pending') fail('failed-precondition', 'This request was already answered.');
    const itemExists = (await tx.get(db.doc(`families/${ctx.fid}/items/${loan.get('item_id')}`))).exists;
    if (!itemExists) fail('not-found', 'That copy is no longer in your library.');
    const others = accept ? await readActivation(ctx, loan.get('item_id'), loan.id) : [];
    const game = await gameInfo(tx, ctx.fid, loan.get('game_id'));

    if (accept) {
      tx.update(loan.ref, { status: 'active', responded_at: now(), lent_at: now(), due_at: due, updated_at: now() });
      declineOthers(ctx, others, game);
      record(ctx, loan, 'accepted', msg, loan.get('borrower_id'), game);
    } else {
      tx.update(loan.ref, { status: 'declined', responded_at: now(), updated_at: now() });
      record(ctx, loan, 'declined', msg, loan.get('borrower_id'), game);
    }
    return { ok: true };
  });
});

export const cancelLoanRequest = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const msg = message(d.message);
  return db.runTransaction(async (tx) => {
    const ctx = await begin(tx, d, uid);
    const loan = await getLoan(ctx, d.loanId);
    if (loan.get('borrower_id') !== uid) fail('permission-denied', 'Only the person who asked can cancel.');
    if (loan.get('status') !== 'pending') fail('failed-precondition', 'This request was already answered.');
    const game = await gameInfo(tx, ctx.fid, loan.get('game_id'));
    tx.update(loan.ref, { status: 'cancelled', responded_at: now(), updated_at: now() });
    record(ctx, loan, 'cancelled', msg, loan.get('lender_id'), game);
    return { ok: true };
  });
});

export const lendGame = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const msg = message(d.message);
  const due = dateOrNull(d.due);
  const borrower = id(d.borrowerId, 'borrower');
  return db.runTransaction(async (tx) => {
    const ctx = await begin(tx, d, uid);
    const { family } = await loadFamily(ctx.fid, uid, tx);
    const item = await tx.get(db.doc(`families/${ctx.fid}/items/${id(d.itemId, 'item')}`));
    if (!item.exists) fail('not-found', 'That game is no longer in your library.');
    if (item.get('owner_id') !== uid) fail('permission-denied', 'You can only lend your own games.');
    if (borrower === uid) fail('invalid-argument', 'Pick someone else.');
    if (!family.member_ids.includes(borrower)) fail('not-found', 'That person is not in the family.');

    const others = await readActivation(ctx, item.id, null);
    const existing = others.find((o) => o.get('borrower_id') === borrower);
    const game = await gameInfo(tx, ctx.fid, item.get('game_id'));

    if (existing) {
      // They already asked: treat this as accepting their request.
      tx.update(existing.ref, { status: 'active', responded_at: now(), lent_at: now(), due_at: due, updated_at: now() });
      declineOthers(ctx, others.filter((o) => o.id !== existing.id), game);
      record(ctx, existing, 'accepted', msg, borrower, game);
      return { loanId: existing.id };
    }

    const ref = loansCol(ctx.fid).doc();
    tx.create(ref, {
      item_id: item.id, game_id: item.get('game_id'), lender_id: uid, borrower_id: borrower, status: 'active',
      request_message: null, due_at: due, requested_at: null, responded_at: now(), lent_at: now(), returned_at: null,
      created_at: now(), updated_at: now(),
    });
    declineOthers(ctx, others, game);
    record(ctx, { id: ref.id } as DocumentSnapshot, 'lent', msg, borrower, game);
    return { loanId: ref.id };
  });
});

export const markLoanReturned = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const msg = message(d.message);
  return db.runTransaction(async (tx) => {
    const ctx = await begin(tx, d, uid);
    const loan = await getLoan(ctx, d.loanId);
    const lender = loan.get('lender_id');
    const borrower = loan.get('borrower_id');
    if (uid !== lender && uid !== borrower) fail('permission-denied', 'Only the two people involved can do that.');
    if (loan.get('status') !== 'active') fail('failed-precondition', 'This game is not currently lent out.');
    const game = await gameInfo(tx, ctx.fid, loan.get('game_id'));
    tx.update(loan.ref, { status: 'returned', returned_at: now(), updated_at: now() });
    record(ctx, loan, 'returned', msg, uid === lender ? borrower : lender, game);
    return { ok: true };
  });
});

export const setLoanDue = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const due = dateOrNull(d.due);
  return db.runTransaction(async (tx) => {
    const ctx = await begin(tx, d, uid);
    const loan = await getLoan(ctx, d.loanId);
    if (loan.get('lender_id') !== uid) fail('permission-denied', 'Only the owner can change the due date.');
    if (!['pending', 'active'].includes(loan.get('status'))) fail('failed-precondition', 'This loan is closed.');
    const game = await gameInfo(tx, ctx.fid, loan.get('game_id'));
    tx.update(loan.ref, { due_at: due, updated_at: now() });
    const label = due
      ? 'Due ' + new Date(due + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      : 'No due date';
    record(ctx, loan, 'due_changed', label, loan.get('borrower_id'), game);
    return { ok: true };
  });
});

export const commentOnLoan = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const body = str(d.body, 'Comment', { min: 1, max: 2000 })!;
  return db.runTransaction(async (tx) => {
    const ctx = await begin(tx, d, uid);
    const loan = await getLoan(ctx, d.loanId);
    const lender = loan.get('lender_id');
    const borrower = loan.get('borrower_id');
    if (uid !== lender && uid !== borrower) fail('permission-denied', 'Only the two people involved can comment.');
    const game = await gameInfo(tx, ctx.fid, loan.get('game_id'));
    tx.update(loan.ref, { updated_at: now() });
    record(ctx, loan, 'comment', body, uid === lender ? borrower : lender, game);
    return { ok: true };
  });
});
