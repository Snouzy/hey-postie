import type { Locale } from './index';

const KB = 1024;
const MB = KB * 1024;

/** A size as the user reads it: "12 KB", "1.5 MB". Below a kilobyte, bytes. */
export function formatBytes(locale: Locale, bytes: number): string {
  const [value, unit] =
    bytes >= MB
      ? [bytes / MB, 'megabyte']
      : bytes >= KB
        ? [bytes / KB, 'kilobyte']
        : [bytes, 'byte'];
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    maximumFractionDigits: value >= 10 || unit === 'byte' ? 0 : 1,
  }).format(value);
}
