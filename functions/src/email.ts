/*
 * Email notifications. Every in-app notification and every invite triggers one
 * email (unless the recipient turned emails off). Optional: with
 * EMAIL_PROVIDER=none nothing is sent and the app works with in-app
 * notifications only.
 */
import { defineSecret, defineString } from 'firebase-functions/params';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, now, type UserDoc } from './common.js';

const EMAIL_PROVIDER = defineString('EMAIL_PROVIDER', {
  default: 'none',
  description: 'resend, brevo or none',
});
const EMAIL_FROM = defineString('EMAIL_FROM', {
  default: 'Family Game Exchange <onboarding@resend.dev>',
  description: 'Sender, e.g. "Family Game Exchange <games@yourdomain.com>"',
});
const SITE_URL = defineString('SITE_URL', {
  description: 'Where the app is hosted, e.g. https://you.github.io/NintendoFamGameExchange/',
});
const EMAIL_API_KEY = defineSecret('EMAIL_API_KEY');

interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function link(path: string): string {
  const base = SITE_URL.value().replace(/#.*$/, '').replace(/\/?$/, '/');
  return `${base}#${path}`;
}

function button(label: string, href: string, color = '#e60012'): string {
  return `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:12px 22px;border-radius:999px;background:${color};color:#ffffff;font-weight:800;font-size:15px;text-decoration:none;font-family:Nunito,Arial,sans-serif">${esc(label)}</a>`;
}

function layout(o: {
  headline: string; intro: string; quote?: string | null; gameTitle?: string | null; gameIcon?: string | null;
  buttons: string; familyLabel: string;
}): string {
  const game = o.gameTitle
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:collapse"><tr>
        ${o.gameIcon ? `<td style="padding-right:14px"><img src="${esc(o.gameIcon)}" width="72" height="72" alt="" style="display:block;border-radius:12px;border:1px solid #e6e6e6"></td>` : ''}
        <td style="font-family:Nunito,Arial,sans-serif;font-size:18px;font-weight:800;color:#1a1a1a">${esc(o.gameTitle)}</td>
      </tr></table>`
    : '';
  const quote = o.quote
    ? `<div style="margin:16px 0;padding:14px 16px;border-left:4px solid #00c3e3;background:#f2fbfd;border-radius:8px;font-family:Nunito,Arial,sans-serif;font-size:15px;color:#333;white-space:pre-wrap">${esc(o.quote)}</div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#ebebeb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ebebeb;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
    <tr><td style="background:#e60012;padding:18px 24px">
      <span style="display:inline-block;border:2.5px solid #ffffff;border-radius:999px;padding:4px 14px;color:#ffffff;font-family:Nunito,Arial,sans-serif;font-weight:900;font-size:16px">Family Game Exchange</span>
      <span style="color:#ffffff;font-family:Nunito,Arial,sans-serif;font-weight:700;font-size:14px;padding-left:8px">${esc(o.familyLabel)}</span>
    </td></tr>
    <tr><td style="padding:26px 24px 8px;font-family:Nunito,Arial,sans-serif;color:#1a1a1a">
      <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;font-weight:900">${esc(o.headline)}</h1>
      <p style="margin:0;font-size:15px;line-height:1.55;color:#555">${o.intro}</p>
      ${game}${quote}
      <div style="margin:20px 0 6px">${o.buttons}</div>
    </td></tr>
    <tr><td style="padding:16px 24px 24px;font-family:Nunito,Arial,sans-serif;font-size:12px;color:#999;border-top:1px solid #f0f0f0">
      You can turn off these emails in Settings on the Game Exchange.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const strip = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function send(email: Email) {
  const provider = EMAIL_PROVIDER.value().toLowerCase();
  const key = EMAIL_API_KEY.value();
  const from = EMAIL_FROM.value();
  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  } else if (provider === 'brevo') {
    const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: from.trim() },
        to: [{ email: email.to }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
  }
}

const enabled = () => ['resend', 'brevo'].includes(EMAIL_PROVIDER.value().toLowerCase()) && !!SITE_URL.value();

export const onNotificationCreated = onDocumentCreated(
  { document: 'users/{uid}/notifications/{nid}', secrets: [EMAIL_API_KEY] },
  async (event) => {
    if (!enabled() || !event.data) return;
    const n = event.data.data();
    const user = (await db.doc(`users/${event.params.uid}`).get()).data() as UserDoc | undefined;
    if (!user?.email || !user.email_notifications) return;
    const family = (await db.doc(`families/${n.family_id}`).get()).data();
    const familyLabel = family ? `${family.emoji ?? ''} ${family.name}`.trim() : '';

    const actor = String(n.actor_name ?? 'Someone');
    const game = String(n.game_title ?? 'a game');
    const loanUrl = n.loan_id ? link(`/loans/${n.loan_id}?family=${n.family_id}`) : link(`/?family=${n.family_id}`);
    const open = button('Open', loanUrl);
    const reply = button('Reply', loanUrl, '#00a7c7');
    let subject: string;
    let headline: string;
    let intro: string;
    let buttons = open;

    switch (n.kind) {
      case 'loan_requested':
        subject = `🎮 ${actor} would like to borrow ${game}`;
        headline = `${actor} would like to borrow ${game}`;
        intro = `Accept it, decline it or leave a comment.`;
        buttons = button('Accept', `${loanUrl}&action=accept`, '#1aa34a') + button('Decline', `${loanUrl}&action=decline`, '#5c5c5c') + reply;
        break;
      case 'loan_accepted':
        subject = `✅ ${actor} said yes — you can borrow ${game}!`;
        headline = 'Request accepted!';
        intro = `${esc(actor)} accepted your request. Arrange the hand-off and have fun!`;
        buttons = open + reply;
        break;
      case 'loan_declined':
        subject = `${actor} can't lend ${game} right now`;
        headline = 'Request declined';
        intro = `${esc(actor)} isn't able to lend this one right now.`;
        break;
      case 'loan_cancelled':
        subject = `The request for ${game} was cancelled`;
        headline = 'Request cancelled';
        intro = `${esc(actor)} cancelled the borrow request.`;
        break;
      case 'loan_lent':
        subject = `🎁 ${actor} lent you ${game}`;
        headline = `${actor} lent you a game`;
        intro = `It's now on your <b>Borrowed</b> list. Remember to give it back when you're done!`;
        buttons = open + reply;
        break;
      case 'loan_returned':
        subject = `📦 ${game} was marked as returned`;
        headline = 'Game returned';
        intro = `${esc(actor)} marked the loan as returned.`;
        break;
      case 'loan_comment':
        subject = `💬 ${actor} commented on ${game}`;
        headline = `New comment from ${actor}`;
        intro = `About <b>${esc(game)}</b>:`;
        buttons = reply;
        break;
      case 'loan_due_changed':
        subject = `📅 New due date for ${game}`;
        headline = 'Due date updated';
        intro = `${esc(actor)} changed the due date.`;
        break;
      case 'member_joined':
        subject = `👋 ${actor} joined ${family?.name ?? 'your family'}`;
        headline = `${actor} joined the family`;
        intro = 'They can now browse and borrow everyone’s games.';
        break;
      default:
        return;
    }

    const html = layout({ headline, intro, quote: n.body, gameTitle: n.game_title, gameIcon: n.game_icon, buttons, familyLabel });
    const text = [headline, '', strip(intro), n.game_title ?? '', n.body ? `\n"${n.body}"` : '', '', loanUrl].join('\n');
    try {
      await send({ to: user.email, subject, html, text });
      await event.data.ref.update({ emailed_at: now() });
    } catch (err) {
      console.error('Notification email failed', err);
      await event.data.ref.update({ email_error: String(err).slice(0, 500) });
    }
  },
);

export const onInviteCreated = onDocumentCreated({ document: 'invites/{inviteId}', secrets: [EMAIL_API_KEY] }, async (event) => {
  if (!enabled() || !event.data) return;
  const inv = event.data.data();
  if (inv.status !== 'pending') return;
  const url = link(`/join/${event.params.inviteId}`);
  const family = `${inv.family_emoji ?? ''} ${inv.family_name}`.trim();
  const html = layout({
    headline: `You're invited to ${inv.family_name}! 🎉`,
    intro: `${esc(inv.invited_by_name)} invited you to share Nintendo games on the Family Game Exchange. Sign in with <b>${esc(inv.email)}</b> to join.`,
    buttons: button('Join the family', url),
    familyLabel: family,
  });
  try {
    await send({
      to: inv.email,
      subject: `${inv.invited_by_name} invited you to ${inv.family_name} on the Family Game Exchange`,
      html,
      text: `${inv.invited_by_name} invited you to ${inv.family_name} on the Family Game Exchange.\nSign in with ${inv.email} to join:\n${url}`,
    });
    await event.data.ref.update({ emailed_at: now() });
  } catch (err) {
    console.error('Invite email failed', err);
  }
});
