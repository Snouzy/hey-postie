import type { Locale, MessageKey } from './index';

/** Within this many days, a day separator names the weekday rather than the date. */
const WEEKDAY_DAYS = 7;

/**
 * "Today", "Yesterday", the weekday within the last week ("Monday"), else a full date: the label
 * of a day separator. A day in the future (a clock ahead of ours) gets its date, never a weekday
 * that would read as the past.
 */
export function dayLabel(
  locale: Locale,
  date: Date,
  text: (key: MessageKey) => string,
  now = new Date(),
): string {
  const days = daysBetween(date, now);
  if (days === 0) return text('date.today');
  if (days === 1) return text('date.yesterday');
  if (days > 1 && days < WEEKDAY_DAYS) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
    // French writes weekdays in lowercase; a label starts with a capital.
    return weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1);
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);
}

export function formatTime(locale: Locale, date: Date): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date);
}

/** Time for a message of today, otherwise a short date: what a chat list row shows. */
export function formatRecent(locale: Locale, date: Date, now = new Date()): string {
  if (daysBetween(date, now) === 0) return formatTime(locale, date);
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
}

/** Local calendar day, used to group messages. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function daysBetween(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}
