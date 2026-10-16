import { LOCALES, type Locale } from '../i18n';

/**
 * The per-viewer conveniences: theme, language and whether notifications show the letter's text.
 * They live in `localStorage` because they belong to this window, not to the account: nothing
 * secret, nothing the core decides. Every read and write is wrapped, so a browser that refuses
 * storage (private window, cleared data) still gets a working app with the defaults.
 */
export type Theme = 'system' | 'light' | 'dark';
export type LocaleChoice = 'system' | Locale;

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
export const LOCALE_CHOICES: readonly LocaleChoice[] = ['system', ...LOCALES];

const THEME_KEY = 'hey-postie:theme';
const LOCALE_KEY = 'hey-postie:locale';
const NOTIFY_PREVIEW_KEY = 'hey-postie:notify-preview';
const WELCOMED_KEY = 'hey-postie:welcomed';
const PANES_KEY = 'hey-postie:panes';

/** The widths of the side columns of the main screen, and whether the sidebar is folded. */
export interface PaneSizes {
  sidebar: number;
  details: number;
  sidebarCollapsed: boolean;
}

/** The bounds of a resizable pane, in CSS pixels; a drag below `min - 40` folds it. */
export interface PaneBounds {
  min: number;
  max: number;
  default: number;
}

export const SIDEBAR_BOUNDS: PaneBounds = { min: 220, max: 480, default: 300 };
export const DETAILS_BOUNDS: PaneBounds = { min: 240, max: 480, default: 280 };

export function readTheme(): Theme {
  const stored = read(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function writeTheme(theme: Theme) {
  write(THEME_KEY, theme === 'system' ? null : theme);
}

export function readLocaleChoice(): LocaleChoice {
  const stored = read(LOCALE_KEY);
  return isLocale(stored) ? stored : 'system';
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

/** Whether this account has already seen the first-launch card. */
export function readWelcomed(jid: string): boolean {
  return welcomedAccounts().includes(jid);
}

export function writeWelcomed(jid: string) {
  if (readWelcomed(jid)) return;
  write(WELCOMED_KEY, JSON.stringify([...welcomedAccounts(), jid]));
}

export function clampPane(bounds: PaneBounds, width: unknown): number {
  if (typeof width !== 'number' || !Number.isFinite(width)) return bounds.default;
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
}

/** The stored sizes, each clamped to its bounds; the defaults for anything missing or odd. */
export function readPaneSizes(): PaneSizes {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(read(PANES_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      stored = parsed as Record<string, unknown>;
    }
  } catch {
    // A truncated value: the defaults.
  }
  return {
    sidebar: clampPane(SIDEBAR_BOUNDS, stored.sidebar),
    details: clampPane(DETAILS_BOUNDS, stored.details),
    sidebarCollapsed: stored.sidebarCollapsed === true,
  };
}

export function writePaneSizes(sizes: PaneSizes) {
  write(PANES_KEY, JSON.stringify(sizes));
}

function welcomedAccounts(): string[] {
  try {
    const parsed: unknown = JSON.parse(read(WELCOMED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function isLocale(value: string | null): value is Locale {
  return LOCALES.some((locale) => locale === value);
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
