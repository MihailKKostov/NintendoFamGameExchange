import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

/** Change this (and VITE_FIREBASE_FUNCTIONS_REGION in the web app) to run closer to your family. */
export const REGION = 'us-central1';

initializeApp();
setGlobalOptions({ region: REGION, maxInstances: 10 });

export const db = getFirestore();

export type Role = 'owner' | 'admin' | 'member';

export interface FamilyDoc {
  name: string;
  emoji: string;
  color: string;
  owner_id: string;
  member_ids: string[];
  admin_ids: string[];
  ai_enabled: boolean;
  ai_key_hint: string | null;
  ai_model: string | null;
  created_at: string;
}

export interface ProfileFields {
  email: string;
  display_name: string;
  nickname: string | null;
  avatar_url: string | null;
  avatar_icon: string | null;
  accent_color: string;
  bio: string | null;
  friend_code: string | null;
  created_at: string;
}

export interface UserDoc extends ProfileFields {
  email_notifications: boolean;
  family_ids: string[];
  updated_at: string;
}

export interface MemberDoc extends ProfileFields {
  role: Role;
  status: 'active' | 'removed';
  joined_at: string;
}

export const PROFILE_KEYS = [
  'email', 'display_name', 'nickname', 'avatar_url', 'avatar_icon', 'accent_color', 'bio', 'friend_code', 'created_at',
] as const;

export const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Errors & validation
// ---------------------------------------------------------------------------

export const fail = (code: 'invalid-argument' | 'failed-precondition' | 'permission-denied' | 'not-found' | 'already-exists' | 'resource-exhausted', message: string): never => {
  throw new HttpsError(code, message);
};

export function requireAuth(req: CallableRequest): { uid: string; email: string; verified: boolean } {
  if (!req.auth) fail('permission-denied', 'Please sign in first.');
  const token = req.auth!.token;
  return { uid: req.auth!.uid, email: String(token.email ?? '').toLowerCase(), verified: token.email_verified === true };
}

export function str(v: unknown, field: string, { min = 0, max = 200, optional = false } = {}): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (optional) return null;
    fail('invalid-argument', `${field} is required.`);
  }
  if (typeof v !== 'string') fail('invalid-argument', `${field} must be text.`);
  const s = (v as string).trim();
  if (s.length < min || s.length > max) fail('invalid-argument', `${field} must be ${min}–${max} characters.`);
  return s;
}

export function id(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v)) fail('invalid-argument', `Invalid ${field}.`);
  return v as string;
}

export function dateOrNull(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    fail('invalid-argument', 'Dates must look like 2026-01-31.');
  }
  return v as string;
}

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length <= 254;
export const isColor = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

// ---------------------------------------------------------------------------
// References & membership
// ---------------------------------------------------------------------------

export const familyRef = (fid: string) => db.doc(`families/${fid}`);
export const memberRef = (fid: string, uid: string) => db.doc(`families/${fid}/members/${uid}`);
export const userRef = (uid: string) => db.doc(`users/${uid}`);

export async function loadFamily(
  fid: string, uid: string, tx?: Transaction,
): Promise<{ ref: DocumentReference; family: FamilyDoc; role: Role }> {
  const ref = familyRef(fid);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) fail('not-found', 'That family no longer exists.');
  const family = snap.data() as FamilyDoc;
  if (!family.member_ids.includes(uid)) fail('permission-denied', 'You are not a member of this family.');
  const role: Role = family.owner_id === uid ? 'owner' : family.admin_ids.includes(uid) ? 'admin' : 'member';
  return { ref, family, role };
}

export function requireAdmin(role: Role) {
  if (role === 'member') fail('permission-denied', 'Only family admins can do that.');
}

/** Short display name for notifications and emails. */
export async function nameOf(fid: string, uid: string, tx?: Transaction): Promise<string> {
  const ref = memberRef(fid, uid);
  const snap = tx ? await tx.get(ref) : await ref.get();
  const m = snap.data() as MemberDoc | undefined;
  return m ? m.nickname?.trim() || m.display_name : 'Someone';
}

export function profileFrom(u: UserDoc): ProfileFields {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) out[k] = u[k] ?? null;
  return out as unknown as ProfileFields;
}
