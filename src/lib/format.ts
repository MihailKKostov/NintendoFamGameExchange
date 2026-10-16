import type { Profile } from '../types';

export const displayName = (p?: Pick<Profile, 'nickname' | 'display_name'> | null) =>
  p ? p.nickname?.trim() || p.display_name : 'Someone';

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function timeAgo(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDate(iso);
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', ...opts });
}

export const yearOf = (iso: string | null | undefined) => (iso ? Number(iso.slice(0, 4)) : null);

/** Days until a YYYY-MM-DD date (negative when overdue). */
export function daysUntil(date: string): number {
  const due = new Date(date + 'T23:59:59');
  return Math.ceil((due.getTime() - Date.now()) / 86_400_000);
}

export function dueLabel(date: string | null): { text: string; tone: 'ok' | 'soon' | 'late' } | null {
  if (!date) return null;
  const d = daysUntil(date);
  if (d < 0) return { text: `Overdue by ${-d} day${d === -1 ? '' : 's'}`, tone: 'late' };
  if (d === 0) return { text: 'Due today', tone: 'soon' };
  if (d === 1) return { text: 'Due tomorrow', tone: 'soon' };
  if (d <= 3) return { text: `Due in ${d} days`, tone: 'soon' };
  return { text: `Due ${formatDate(date, { year: undefined })}`, tone: 'ok' };
}

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function dateInputValue(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
