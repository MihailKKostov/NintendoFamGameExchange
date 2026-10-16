// Sends the emails queued in public.notifications (and pending invites).
//
// The web app calls this right after any loan action and once per visit, so a
// missed send is retried automatically. Rows are claimed atomically with
// claim_email_outbox(), so concurrent calls never send the same email twice.
//
// Secrets:
//   SITE_URL        e.g. https://you.github.io/NintendoFamGameExchange/   (required)
//   EMAIL_FROM      e.g. "Family Game Exchange <games@yourdomain.com>"   (required)
//   RESEND_API_KEY  or  BREVO_API_KEY                                    (one required)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { callerIsMember } from '../_shared/auth.ts';
import { corsHeaders, env, json } from '../_shared/http.ts';

interface OutboxRow {
  kind: string;
  notification_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  wants_email: boolean;
  actor_name: string | null;
  loan_id: string | null;
  game_title: string | null;
  game_icon: string | null;
  body: string | null;
  invited_by_name: string | null;
}

interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function siteLink(path: string): string {
  const base = env('SITE_URL', '')!.replace(/#.*$/, '').replace(/\/?$/, '/');
  return `${base}#${path}`;
}

function button(label: string, href: string, color = '#e60012'): string {
  return `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:12px 22px;border-radius:999px;background:${color};color:#ffffff;font-weight:800;font-size:15px;text-decoration:none;font-family:Nunito,Arial,sans-serif">${esc(label)}</a>`;
}

function layout(opts: {
  preheader: string;
  headline: string;
  intro: string;
  quote?: string | null;
  gameTitle?: string | null;
  gameIcon?: string | null;
  buttons: string;
}): string {
  const game = opts.gameTitle
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:collapse"><tr>
        ${opts.gameIcon ? `<td style="padding-right:14px"><img src="${esc(opts.gameIcon)}" width="72" height="72" alt="" style="display:block;border-radius:12px;border:1px solid #e6e6e6"></td>` : ''}
        <td style="font-family:Nunito,Arial,sans-serif;font-size:18px;font-weight:800;color:#1a1a1a">${esc(opts.gameTitle)}</td>
      </tr></table>`
    : '';
  const quote = opts.quote
    ? `<div style="margin:16px 0;padding:14px 16px;border-left:4px solid #00c3e3;background:#f2fbfd;border-radius:8px;font-family:Nunito,Arial,sans-serif;font-size:15px;color:#333;white-space:pre-wrap">${esc(opts.quote)}</div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#ebebeb">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ebebeb;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <tr><td style="background:#e60012;padding:18px 24px">
      <span style="display:inline-block;border:2.5px solid #ffffff;border-radius:999px;padding:4px 14px;color:#ffffff;font-family:Nunito,Arial,sans-serif;font-weight:900;font-size:16px;letter-spacing:.3px">Family Game Exchange</span>
    </td></tr>
    <tr><td style="padding:26px 24px 8px;font-family:Nunito,Arial,sans-serif;color:#1a1a1a">
      <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;font-weight:900">${esc(opts.headline)}</h1>
      <p style="margin:0;font-size:15px;line-height:1.55;color:#555">${opts.intro}</p>
      ${game}${quote}
      <div style="margin:20px 0 6px">${opts.buttons}</div>
    </td></tr>
    <tr><td style="padding:16px 24px 24px;font-family:Nunito,Arial,sans-serif;font-size:12px;color:#999;border-top:1px solid #f0f0f0">
      You're getting this because you're a member of your family's Game Exchange. You can turn off emails in your profile settings.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function compose(row: OutboxRow): Email | null {
  const actor = row.actor_name ?? 'Someone';
  const game = row.game_title ?? 'a game';
  const loanUrl = row.loan_id ? siteLink(`/loans/${row.loan_id}`) : siteLink('/loans');
  const viewButton = button('Open request', loanUrl);
  const replyButton = button('Reply', loanUrl, '#00a7c7');

  let subject: string;
  let headline: string;
  let intro: string;
  let buttons = viewButton;

  switch (row.kind) {
    case 'loan_requested':
      subject = `🎮 ${actor} would like to borrow ${game}`;
      headline = `${actor} would like to borrow ${game}`;
      intro = `${esc(actor)} sent you a borrow request. Accept it, decline it or leave a comment.`;
      buttons =
        button('Accept', `${loanUrl}?action=accept`, '#1aa34a') +
        button('Decline', `${loanUrl}?action=decline`, '#5c5c5c') +
        replyButton;
      break;
    case 'loan_accepted':
      subject = `✅ ${actor} said yes — ${game} is yours to borrow!`;
      headline = `Request accepted!`;
      intro = `${esc(actor)} accepted your request. Arrange the hand-off and have fun!`;
      buttons = viewButton + replyButton;
      break;
    case 'loan_declined':
      subject = `${actor} can't lend ${game} right now`;
      headline = `Request declined`;
      intro = `${esc(actor)} isn't able to lend this one right now.`;
      break;
    case 'loan_cancelled':
      subject = `${actor} cancelled the request for ${game}`;
      headline = `Request cancelled`;
      intro = `${esc(actor)} cancelled the borrow request.`;
      break;
    case 'loan_lent':
      subject = `🎁 ${actor} lent you ${game}`;
      headline = `${actor} lent you a game`;
      intro = `It's now on your <b>Borrowed</b> list. Remember to give it back when you're done!`;
      buttons = viewButton + replyButton;
      break;
    case 'loan_returned':
      subject = `📦 ${game} was marked as returned`;
      headline = `Game returned`;
      intro = `${esc(actor)} marked the loan as returned.`;
      break;
    case 'loan_comment':
      subject = `💬 ${actor} commented on ${game}`;
      headline = `New comment from ${actor}`;
      intro = `About your loan of <b>${esc(game)}</b>:`;
      buttons = replyButton;
      break;
    case 'loan_due_changed':
      subject = `📅 New due date for ${game}`;
      headline = `Due date updated`;
      intro = `${esc(actor)} changed the due date.`;
      break;
    case 'invite': {
      const who = row.invited_by_name ?? 'Your family';
      subject = `${who} invited you to the Family Game Exchange`;
      headline = `You're invited! 🎉`;
      intro = `${esc(who)} invited you to share Nintendo games with the family. Sign in with this email address (<b>${esc(row.recipient_email)}</b>) to set up your profile and add your games.`;
      buttons = button('Join the Game Exchange', siteLink('/login'));
      return finish(row, subject, headline, intro, buttons, row.body);
    }
    default:
      return null;
  }

  return finish(row, subject, headline, intro, buttons, row.body);
}

function finish(
  row: OutboxRow, subject: string, headline: string, intro: string, buttons: string, quote: string | null,
): Email {
  const html = layout({
    preheader: subject,
    headline,
    intro,
    quote,
    gameTitle: row.game_title,
    gameIcon: row.game_icon,
    buttons,
  });
  const plainIntro = intro.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const link = row.loan_id ? siteLink(`/loans/${row.loan_id}`) : siteLink(row.kind === 'invite' ? '/login' : '/loans');
  const text = [headline, '', plainIntro, row.game_title ?? '', quote ? `\n"${quote}"` : '', '', link]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n');
  return { to: row.recipient_email, subject, html, text };
}

function parseFrom(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return match ? { name: match[1].trim() || undefined, email: match[2].trim() } : { email: from.trim() };
}

async function send(email: Email): Promise<void> {
  const from = env('EMAIL_FROM');
  if (!from) throw new Error('EMAIL_FROM secret is not set');

  const resendKey = env('RESEND_API_KEY');
  const brevoKey = env('BREVO_API_KEY');

  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return;
  }

  if (brevoKey) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: parseFrom(from),
        to: [{ email: email.to }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
    return;
  }

  throw new Error('No email provider configured (set RESEND_API_KEY or BREVO_API_KEY)');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!(await callerIsMember(req))) return json({ error: 'Not a member' }, 403);

  if (!env('SITE_URL') || !env('EMAIL_FROM') || !(env('RESEND_API_KEY') || env('BREVO_API_KEY'))) {
    // Not configured yet: leave the outbox untouched so nothing is lost.
    return json({ sent: 0, skipped: 0, failed: 0, configured: false });
  }

  const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.rpc('claim_email_outbox', { p_limit: 25 });
  if (error) {
    console.error('claim_email_outbox failed', error);
    return json({ error: 'Could not read the outbox' }, 500);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of (data ?? []) as OutboxRow[]) {
    if (!row.wants_email) {
      skipped++;
      continue;
    }
    const email = compose(row);
    if (!email) {
      skipped++;
      continue;
    }
    try {
      await send(email);
      sent++;
    } catch (err) {
      failed++;
      console.error('Email failed', row.kind, row.recipient_email, err);
      if (row.notification_id) {
        await admin.rpc('record_email_error', { p_notification: row.notification_id, p_error: String(err) });
      }
    }
  }

  return json({ sent, skipped, failed, configured: true });
});
