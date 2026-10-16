import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { appBaseUrl, config } from '../config';
import type { Session } from '../types';
import type { Api, Table } from './types';

/** Turn Postgres / GoTrue errors into sentences people can act on. */
export function friendlyError(error: unknown): Error {
  const raw =
    (error as { message?: string })?.message ??
    (typeof error === 'string' ? error : 'Something went wrong');
  const msg = String(raw);
  if (/Database error saving new user|not_invited/i.test(msg)) {
    return new Error("This email isn't on the invite list. Ask a family admin to invite you.");
  }
  if (/Signups not allowed|User not found/i.test(msg)) {
    return new Error("This email isn't on the invite list. Ask a family admin to invite you.");
  }
  if (/Token has expired|invalid.*(otp|token)/i.test(msg)) {
    return new Error('That code is wrong or has expired. Request a new one.');
  }
  if (/rate limit|security purposes/i.test(msg)) {
    return new Error('Too many attempts — please wait a minute and try again.');
  }
  if (/duplicate key value.*invites_pkey/i.test(msg)) return new Error('That email is already invited.');
  if (/row-level security|permission denied/i.test(msg)) {
    return new Error("You don't have permission to do that.");
  }
  // Our SQL functions raise "code: Human readable message"
  const m = msg.match(/^[a-z_]+: (.+)$/);
  return new Error(m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : msg);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T = any>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw friendlyError(error);
  return data as T;
}

export function createSupabaseApi(): Api {
  const sb: SupabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const toSession = (s: { user: { id: string; email?: string } } | null): Session | null =>
    s ? { userId: s.user.id, email: (s.user.email ?? '').toLowerCase() } : null;

  const uid = async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error('You are signed out.');
    return data.session.user.id;
  };

  const rpc = <T = unknown>(fn: string, args: Record<string, unknown>) => unwrap<T>(sb.rpc(fn, args));

  return {
    mode: 'supabase',

    async getSession() {
      const { data } = await sb.auth.getSession();
      return toSession(data.session);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toSession(s)));
      return () => data.subscription.unsubscribe();
    },
    async sendLoginCode(email) {
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true, emailRedirectTo: appBaseUrl() },
      });
      if (error) throw friendlyError(error);
    },
    async verifyLoginCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
      if (error) throw friendlyError(error);
    },
    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appBaseUrl() } });
      if (error) throw friendlyError(error);
    },
    async signOut() {
      await sb.auth.signOut();
    },

    async getMembership() {
      const [member, admin] = await Promise.all([rpc<boolean>('is_member', {}), rpc<boolean>('is_admin', {})]);
      return { member: !!member, admin: !!admin };
    },

    listProfiles: () => unwrap(sb.from('profiles').select('*').order('display_name')),
    listGames: () => unwrap(sb.from('games').select('*').order('title')),
    listLibrary: () => unwrap(sb.from('library_items').select('*').order('created_at', { ascending: false })),
    listLoans: () => unwrap(sb.from('loans').select('*').order('created_at', { ascending: false })),
    listLoanEvents: (loanId) =>
      unwrap(sb.from('loan_events').select('*').eq('loan_id', loanId).order('created_at')),
    async listNotifications() {
      return unwrap(
        sb.from('notifications')
          .select('id,user_id,actor_id,loan_id,kind,body,read_at,created_at')
          .eq('user_id', await uid())
          .order('created_at', { ascending: false })
          .limit(60),
      );
    },
    listInvites: () => unwrap(sb.from('invites').select('email,is_admin,note,invited_by,created_at').order('created_at')),

    async updateMyProfile(patch) {
      await unwrap(sb.from('profiles').update(patch).eq('id', await uid()));
    },
    async uploadAvatar(file) {
      const me = await uid();
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${me}/${Date.now()}.${ext}`;
      await unwrap(sb.storage.from('avatars').upload(path, file, { contentType: file.type, cacheControl: '31536000' }));
      return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    },

    addToLibrary: (game, opts) =>
      rpc<string>('add_to_library', {
        p_game: game,
        p_format: opts.format,
        p_condition: opts.condition ?? null,
        p_notes: opts.notes ?? null,
      }),
    async updateLibraryItem(id, patch) {
      await unwrap(sb.from('library_items').update(patch).eq('id', id));
    },
    async removeLibraryItem(id) {
      await unwrap(sb.from('library_items').delete().eq('id', id));
    },

    requestLoan: (itemId, message) => rpc<string>('request_loan', { p_item_id: itemId, p_message: message }),
    respondToLoan: (loanId, accept, message, due) =>
      rpc('respond_to_loan', { p_loan_id: loanId, p_accept: accept, p_message: message, p_due: due }).then(() => {}),
    cancelLoanRequest: (loanId, message) =>
      rpc('cancel_loan_request', { p_loan_id: loanId, p_message: message }).then(() => {}),
    lendGame: (itemId, borrowerId, due, message) =>
      rpc<string>('lend_game', { p_item_id: itemId, p_borrower_id: borrowerId, p_due: due, p_message: message }),
    markReturned: (loanId, message) =>
      rpc('mark_loan_returned', { p_loan_id: loanId, p_message: message }).then(() => {}),
    setLoanDue: (loanId, due) => rpc('set_loan_due', { p_loan_id: loanId, p_due: due }).then(() => {}),
    commentOnLoan: (loanId, body) => rpc('comment_on_loan', { p_loan_id: loanId, p_body: body }).then(() => {}),

    markNotificationsRead: (ids) => rpc('mark_notifications_read', { p_ids: ids ?? null }).then(() => {}),
    async flushEmails() {
      try {
        await sb.functions.invoke('send-notifications', { body: {} });
      } catch {
        /* emails are retried on the next action or visit */
      }
    },

    async recognizeGames(image) {
      const { data, error } = await sb.functions.invoke('recognize-games', { body: { image } });
      if (error) {
        let detail = '';
        try {
          detail = (await (error as { context?: Response }).context?.json())?.error ?? '';
        } catch {
          /* ignore */
        }
        throw new Error(detail || 'Could not scan that image. Please try again.');
      }
      return data?.games ?? [];
    },

    async addInvite(email, isAdmin, note) {
      await unwrap(sb.from('invites').insert({ email: email.trim().toLowerCase(), is_admin: isAdmin, note: note || null }));
    },
    async removeInvite(email) {
      await unwrap(sb.from('invites').delete().eq('email', email));
    },
    async setInviteAdmin(email, isAdmin) {
      await unwrap(sb.from('invites').update({ is_admin: isAdmin }).eq('email', email));
    },

    subscribe(onChange) {
      const tables: Table[] = ['library_items', 'loans', 'loan_events', 'notifications', 'profiles'];
      const channel = sb.channel('family-changes');
      for (const table of tables) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table));
      }
      channel.subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}
