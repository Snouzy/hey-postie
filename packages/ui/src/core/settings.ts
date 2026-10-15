import type { Locale } from '../i18n';

/**
 * The per-viewer conveniences: theme, language and whether notifications show the letter's text.
 * They live in `localStorage` because they belong to this window, not to the account: nothing
 * secret, nothing the core decides. Every read and write is wrapped, so a browser that refuses
 * storage (private window, cleared data) still gets a working app with the defaults.
 */
export type Theme = 'system' | 'light' | 'dark';
export type LocaleChoice = 'system' | Locale;

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
export const LOCALE_CHOICES: readonly LocaleChoice[] = ['system', 'en', 'fr'];

const THEME_KEY = 'hey-postie:theme';
const LOCALE_KEY = 'hey-postie:locale';
const NOTIFY_PREVIEW_KEY = 'hey-postie:notify-preview';

export function readTheme(): Theme {
  const stored = read(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function writeTheme(theme: Theme) {
  write(THEME_KEY, theme === 'system' ? null : theme);
}

export function readLocaleChoice(): LocaleChoice {
  const stored = read(LOCALE_KEY);
  return stored === 'en' || stored === 'fr' ? stored : 'system';
}

export function writeLocaleChoice(choice: LocaleChoice) {
  write(LOCALE_KEY, choice === 'system' ? null : choice);
}

/** On unless the user turned it off. */
export function readShowPreview(): boolean {
  return read(NOTIFY_PREVIEW_KEY) !== 'off';
}

export function writeShowPreview(value: boolean) {
  write(NOTIFY_PREVIEW_KEY, value ? null : 'off');
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage refused: the choice holds for this window only.
  }
}
