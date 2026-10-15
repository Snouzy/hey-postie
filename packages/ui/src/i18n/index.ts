import { en, type MessageKey } from './en';
import { fr } from './fr';

export type Locale = 'en' | 'fr';
export type { MessageKey };
export { en, fr };

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, fr };

/** Picks the first supported language from the system's list; English when none matches. */
export function pickLocale(candidates: readonly string[]): Locale {
  for (const candidate of candidates) {
    const language = candidate.toLowerCase().split('-')[0];
    if (language === 'fr' || language === 'en') return language;
  }
  return 'en';
}

export function t(locale: Locale, key: MessageKey): string {
  return dictionaries[locale][key] || en[key];
}
