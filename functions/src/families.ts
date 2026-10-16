import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import {
  db, fail, familyRef, id, isColor, isEmail, loadFamily, memberRef, nameOf, now, profileFrom, requireAdmin, requireAuth, str,
  userRef, type FamilyDoc, type MemberDoc, type UserDoc,
} from './common.js';
import { logEvent, notify } from './loanHelpers.js';

const ICONS = ['🍄', '⭐', '🐢', '👾', '🎮', '🌸', '🦊', '🐙'];
const COLORS = ['#e60012', '#0ab9e6', '#ff3c28', '#1edc00', '#ffdc00', '#b400e6', '#ff8c00', '#00b894'];
const MAX_FAMILIES_PER_USER = 10;
const MAX_PENDING_INVITES = 50;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Create the signed-in person's profile on first visit (idempotent). */
export const ensureUser = onCall(async (req) => {
  const { uid, email } = requireAuth(req);
  const ref = userRef(uid);
  const snap = await ref.get();
  if (snap.exists) return { created: false };

  const tokenName = typeof req.auth!.token.name === 'string' ? req.auth!.token.name : '';
  const local = email.split('@')[0].replace(/[._+-]+/g, ' ').trim();
  const pretty = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const displayName = (tokenName || pretty(local) || 'Player').slice(0, 40);
  const picture = typeof req.auth!.token.picture === 'string' ? req.auth!.token.picture : null;

  const doc: UserDoc = {
    email,
    display_name: displayName,
    nickname: displayName.split(' ')[0].slice(0, 30),
    avatar_url: picture,
    avatar_icon: ICONS[hash(email) % ICONS.length],
    accent_color: COLORS[hash(email + 'c') % COLORS.length],
    bio: null,
    friend_code: null,
    email_notifications: true,
    family_ids: [],
    created_at: now(),
    updated_at: now(),
  };
  await ref.create(doc).catch(() => undefined); // a parallel call may have created it
  return { created: true };
});

/** Update my profile and the copy each of my families shows. */
export const updateProfile = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const p = (req.data ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if ('display_name' in p) patch.display_name = str(p.display_name, 'Account name', { min: 1, max: 40 });
  if ('nickname' in p) patch.nickname = str(p.nickname, 'Nickname', { max: 30, optional: true });
  if ('bio' in p) patch.bio = str(p.bio, 'Status message', { max: 280, optional: true });
  if ('avatar_icon' in p) patch.avatar_icon = str(p.avatar_icon, 'Icon', { max: 16, optional: true });
  if ('avatar_url' in p) {
    const url = str(p.avatar_url, 'Picture', { max: 1000, optional: true });
    const local = process.env.FUNCTIONS_EMULATOR === 'true' && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url ?? '');
    if (url && !/^https:\/\//.test(url) && !local) fail('invalid-argument', 'Pictures must be https links.');
    patch.avatar_url = url;
  }
  if ('accent_color' in p) {
    const c = str(p.accent_color, 'Colour', { max: 7 })!;
    if (!isColor(c)) fail('invalid-argument', 'Pick a colour from the list.');
    patch.accent_color = c;
  }
  if ('friend_code' in p) {
    const fc = str(p.friend_code, 'Friend code', { max: 17, optional: true });
    if (fc && !/^SW-\d{4}-\d{4}-\d{4}$/.test(fc)) fail('invalid-argument', 'Friend codes look like SW-1234-5678-9012');
    patch.friend_code = fc;
  }
  if ('email_notifications' in p) patch.email_notifications = p.email_notifications === true;
  if (!Object.keys(patch).length) return { ok: true };

  const snap = await userRef(uid).get();
  if (!snap.exists) fail('failed-precondition', 'Profile not found — reload the page.');
  const user = snap.data() as UserDoc;

  const batch = db.batch();
  batch.update(userRef(uid), { ...patch, updated_at: now() });
  const shared = { ...patch };
  delete shared.email_notifications;
  if (Object.keys(shared).length) {
    for (const fid of user.family_ids) batch.set(memberRef(fid, uid), shared, { merge: true });
  }
  await batch.commit();
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

function familyInput(p: Record<string, unknown>, partial = false) {
  const out: Partial<Pick<FamilyDoc, 'name' | 'emoji' | 'color'>> = {};
  if (!partial || 'name' in p) out.name = str(p.name, 'Family name', { min: 1, max: 40 })!;
  if (!partial || 'emoji' in p) out.emoji = str(p.emoji, 'Emoji', { max: 16, optional: true }) ?? '🏠';
  if (!partial || 'color' in p) {
    const c = str(p.color, 'Colour', { max: 7, optional: true }) ?? '#e60012';
    if (!isColor(c)) fail('invalid-argument', 'Pick a colour from the list.');
    out.color = c;
  }
  return out;
}

export const createFamily = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const input = familyInput((req.data ?? {}) as Record<string, unknown>);

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef(uid));
    if (!userSnap.exists) fail('failed-precondition', 'Profile not found — reload the page.');
    const user = userSnap.data() as UserDoc;
    if (user.family_ids.length >= MAX_FAMILIES_PER_USER) {
      fail('resource-exhausted', `You can be in at most ${MAX_FAMILIES_PER_USER} families.`);
    }

    const ref = db.collection('families').doc();
    const family: FamilyDoc = {
      name: input.name!, emoji: input.emoji!, color: input.color!, owner_id: uid, member_ids: [uid], admin_ids: [uid],
      ai_enabled: false, ai_key_hint: null, ai_model: null, created_at: now(),
    };
    const member: MemberDoc = { ...profileFrom(user), role: 'owner', status: 'active', joined_at: now() };
    tx.create(ref, family);
    tx.create(memberRef(ref.id, uid), member);
    tx.update(userRef(uid), { family_ids: FieldValue.arrayUnion(ref.id) });
    return { familyId: ref.id };
  });
});

export const updateFamily = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const p = (req.data ?? {}) as Record<string, unknown>;
  const fid = id(p.familyId, 'family');
  const { ref, role } = await loadFamily(fid, uid);
  requireAdmin(role);
  const patch = familyInput(p, true);
  if (Object.keys(patch).length) await ref.update(patch);

  // Keep pending invites showing the current name.
  if (patch.name || patch.emoji) {
    const invites = await db.collection('invites').where('family_id', '==', fid).where('status', '==', 'pending').get();
    const batch = db.batch();
    invites.docs.forEach((d) =>
      batch.update(d.ref, { ...(patch.name ? { family_name: patch.name } : {}), ...(patch.emoji ? { family_emoji: patch.emoji } : {}) }),
    );
    if (!invites.empty) await batch.commit();
  }
  return { ok: true };
});

export const deleteFamily = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const fid = id((req.data ?? {}).familyId, 'family');
  const { ref, family, role } = await loadFamily(fid, uid);
  if (role !== 'owner') fail('permission-denied', 'Only the family owner can delete the family.');

  const batch = db.batch();
  for (const m of family.member_ids) batch.update(userRef(m), { family_ids: FieldValue.arrayRemove(fid) });
  const invites = await db.collection('invites').where('family_id', '==', fid).get();
  invites.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  await db.recursiveDelete(ref);
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export const inviteMember = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const p = (req.data ?? {}) as Record<string, unknown>;
  const fid = id(p.familyId, 'family');
  const email = String(p.email ?? '').trim().toLowerCase();
  const role = p.role === 'admin' ? 'admin' : 'member';
  if (!isEmail(email)) fail('invalid-argument', 'That does not look like an email address.');

  const { family, role: myRole } = await loadFamily(fid, uid);
  requireAdmin(myRole);

  const [members, pending] = await Promise.all([
    db.collection(`families/${fid}/members`).where('email', '==', email).where('status', '==', 'active').limit(1).get(),
    db.collection('invites').where('family_id', '==', fid).where('status', '==', 'pending').get(),
  ]);
  if (!members.empty) fail('already-exists', 'That person is already in the family.');
  const existing = pending.docs.find((d) => d.get('email') === email);
  if (existing) await existing.ref.delete(); // re-inviting sends a fresh email
  else if (pending.size >= MAX_PENDING_INVITES) fail('resource-exhausted', 'Too many pending invites.');

  const inviter = (await memberRef(fid, uid).get()).data() as MemberDoc | undefined;
  const ref = await db.collection('invites').add({
    family_id: fid,
    family_name: family.name,
    family_emoji: family.emoji,
    email,
    role,
    invited_by: uid,
    invited_by_name: inviter ? inviter.nickname?.trim() || inviter.display_name : 'A family member',
    status: 'pending',
    created_at: now(),
  });
  return { inviteId: ref.id };
});

export const revokeInvite = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const inviteId = id((req.data ?? {}).inviteId, 'invite');
  const ref = db.doc(`invites/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists) fail('not-found', 'That invite no longer exists.');
  const { role } = await loadFamily(snap.get('family_id'), uid);
  requireAdmin(role);
  await ref.update({ status: 'revoked' });
  return { ok: true };
});

export const declineInvite = onCall(async (req) => {
  const { email } = requireAuth(req);
  const inviteId = id((req.data ?? {}).inviteId, 'invite');
  const ref = db.doc(`invites/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get('email') !== email) fail('not-found', 'That invite was not found.');
  await ref.update({ status: 'declined' });
  return { ok: true };
});

export const acceptInvite = onCall(async (req) => {
  const { uid, email, verified } = requireAuth(req);
  const inviteId = id((req.data ?? {}).inviteId, 'invite');
  if (!verified) fail('permission-denied', 'Please verify your email address first.');

  return db.runTransaction(async (tx) => {
    const inviteRef = db.doc(`invites/${inviteId}`);
    const invite = await tx.get(inviteRef);
    if (!invite.exists || invite.get('email') !== email) {
      fail('not-found', 'That invite was not found. It may have been sent to a different email address.');
    }
    if (invite.get('status') !== 'pending') fail('failed-precondition', 'That invite is no longer valid.');
    const fid = invite.get('family_id') as string;

    const famRef = familyRef(fid);
    const [famSnap, userSnap, memberSnap] = await Promise.all([tx.get(famRef), tx.get(userRef(uid)), tx.get(memberRef(fid, uid))]);
    if (!famSnap.exists) fail('not-found', 'That family no longer exists.');
    if (!userSnap.exists) fail('failed-precondition', 'Profile not found — reload the page.');
    const family = famSnap.data() as FamilyDoc;
    const user = userSnap.data() as UserDoc;

    tx.update(inviteRef, { status: 'accepted', accepted_at: now(), accepted_by: uid });
    if (family.member_ids.includes(uid)) return { familyId: fid };
    if (user.family_ids.length >= MAX_FAMILIES_PER_USER) {
      fail('resource-exhausted', `You can be in at most ${MAX_FAMILIES_PER_USER} families.`);
    }

    const role = invite.get('role') === 'admin' ? 'admin' : 'member';
    const member: MemberDoc = {
      ...profileFrom(user),
      role,
      status: 'active',
      joined_at: memberSnap.exists ? memberSnap.get('joined_at') : now(),
    };
    tx.set(memberRef(fid, uid), member);
    tx.update(famRef, {
      member_ids: FieldValue.arrayUnion(uid),
      ...(role === 'admin' ? { admin_ids: FieldValue.arrayUnion(uid) } : {}),
    });
    tx.update(userRef(uid), { family_ids: FieldValue.arrayUnion(fid) });

    const inviter = invite.get('invited_by') as string | undefined;
    if (inviter && inviter !== uid && family.member_ids.includes(inviter)) {
      notify(tx, {
        userId: inviter, familyId: fid, actorId: uid, actorName: user.nickname?.trim() || user.display_name,
        kind: 'member_joined', body: null, loanId: null, gameTitle: null, gameIcon: null,
      });
    }
    return { familyId: fid };
  });
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/** Remove someone from a family (admins), or leave it yourself (pass your own uid). */
export const removeMember = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const p = (req.data ?? {}) as Record<string, unknown>;
  const fid = id(p.familyId, 'family');
  const target = id(p.userId ?? uid, 'member');

  return db.runTransaction(async (tx) => {
    const { ref, family, role } = await loadFamily(fid, uid, tx);
    if (target === family.owner_id) {
      fail('failed-precondition', target === uid ? 'Owners can’t leave — delete the family instead.' : 'The owner can’t be removed.');
    }
    if (target !== uid) {
      requireAdmin(role);
      if (family.admin_ids.includes(target) && role !== 'owner') fail('permission-denied', 'Only the owner can remove an admin.');
    }
    if (!family.member_ids.includes(target)) return { ok: true };

    const loans = db.collection(`families/${fid}/loans`);
    const [asLender, asBorrower, items] = await Promise.all([
      tx.get(loans.where('lender_id', '==', target).where('status', 'in', ['pending', 'active'])),
      tx.get(loans.where('borrower_id', '==', target).where('status', 'in', ['pending', 'active'])),
      tx.get(db.collection(`families/${fid}/items`).where('owner_id', '==', target)),
    ]);
    const open = [...asLender.docs, ...asBorrower.docs];
    if (open.some((d) => d.get('status') === 'active')) {
      fail('failed-precondition', 'They still have games on loan. Mark those loans as returned first.');
    }
    const actorName = await nameOf(fid, uid, tx);

    for (const loan of open) {
      tx.update(loan.ref, { status: 'cancelled', responded_at: now(), updated_at: now() });
      const other = loan.get('lender_id') === target ? loan.get('borrower_id') : loan.get('lender_id');
      logEvent(tx, fid, loan.id, uid, 'cancelled', 'This person left the family.');
      if (other !== uid) {
        notify(tx, {
          userId: other, familyId: fid, actorId: uid, actorName, kind: 'loan_cancelled',
          body: 'This person left the family.', loanId: loan.id, gameTitle: null, gameIcon: null,
        });
      }
    }
    items.docs.forEach((d) => tx.delete(d.ref));
    tx.update(memberRef(fid, target), { status: 'removed', role: 'member' });
    tx.update(ref, { member_ids: FieldValue.arrayRemove(target), admin_ids: FieldValue.arrayRemove(target) });
    tx.update(userRef(target), { family_ids: FieldValue.arrayRemove(fid) });
    return { ok: true };
  });
});

export const setMemberRole = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const p = (req.data ?? {}) as Record<string, unknown>;
  const fid = id(p.familyId, 'family');
  const target = id(p.userId, 'member');
  const newRole = p.role === 'admin' ? 'admin' : 'member';

  const { ref, family, role } = await loadFamily(fid, uid);
  requireAdmin(role);
  if (!family.member_ids.includes(target)) fail('not-found', 'That person is not in the family.');
  if (target === family.owner_id) fail('failed-precondition', 'The owner is always an admin.');
  if (newRole === 'member' && family.admin_ids.includes(target) && role !== 'owner' && target !== uid) {
    fail('permission-denied', 'Only the owner can demote another admin.');
  }
  const batch = db.batch();
  batch.update(ref, { admin_ids: newRole === 'admin' ? FieldValue.arrayUnion(target) : FieldValue.arrayRemove(target) });
  batch.update(memberRef(fid, target), { role: newRole });
  await batch.commit();
  return { ok: true };
});
