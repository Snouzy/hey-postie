import { en, type MessageKey } from './en';
import { fr } from './fr';

export type Locale = 'en' | 'fr';
export type { MessageKey };

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, fr };

/** Returns the `t` function of one language. */
export function useTexts(locale: Locale) {
  const dictionary = dictionaries[locale];
  return (key: MessageKey): string => dictionary[key];
}

/** The URL of each page in each language, so the language switch and `hreflang` agree. */
export const ROUTES = {
  home: { en: '/', fr: '/fr/' },
  privacy: { en: '/privacy/', fr: '/fr/confidentialite/' },
} as const;

export type Route = keyof typeof ROUTES;
