import { ASSISTANT_DEFAULT_PORT, type AssistantSettings } from '@hey-postie/core';
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
const ASSISTANT_KEY = 'hey-postie:assistant';
const FOLDED_GROUPS_KEY = 'hey-postie:folded-groups';
const READ_MARKERS_KEY = 'hey-postie:read-markers';
const EMOJI_USAGE_KEY = 'hey-postie:emoji-usage';
/** Enough to know the favourites; the rest is forgotten. */
const EMOJI_USAGE_KEPT = 24;

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

/** "Tell others when I have read their letters": on unless the user turned it off (a rule of the core). */
export function readSendReadMarkers(): boolean {
  return read(READ_MARKERS_KEY) !== 'off';
}

export function writeSendReadMarkers(value: boolean) {
  write(READ_MARKERS_KEY, value ? null : 'off');
}

/** How many times the viewer reacted with each emoji from a letter's toolbar: their quick row. */
export function readEmojiUsage(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(read(EMOJI_USAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0,
      ),
    );
  } catch {
    return {};
  }
}

export function recordEmojiUse(emoji: string) {
  const usage = readEmojiUsage();
  usage[emoji] = (usage[emoji] ?? 0) + 1;
  const kept = Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, EMOJI_USAGE_KEPT);
  write(EMOJI_USAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
}

/** Whether this account has already seen the first-launch card. */
export function readWelcomed(jid: string): boolean {
  return welcomedAccounts().includes(jid);
}

export function writeWelcomed(jid: string) {
  if (readWelcomed(jid)) return;
  write(WELCOMED_KEY, JSON.stringify([...welcomedAccounts(), jid]));
}

/**
 * The user's choice for Claude's access (the core holds the rule, as for the preview). Anything
 * missing or odd reads as the default: off, sealed chats excluded, the default port.
 */
export function readAssistantSettings(): AssistantSettings {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(read(ASSISTANT_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      stored = parsed as Record<string, unknown>;
    }
  } catch {
    // A truncated value: the defaults.
  }
  const port = stored.port;
  return {
    mode: assistantMode(stored.mode),
    includeSealed: stored.includeSealed === true,
    port:
      typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535
        ? port
        : ASSISTANT_DEFAULT_PORT,
  };
}

/** `readAndSend` was the mode's name before drafts replaced sending (2026-10-16). */
function assistantMode(value: unknown): AssistantSettings['mode'] {
  if (value === 'read' || value === 'readDraftAndSend') return value;
  if (value === 'readAndDraft' || value === 'readAndSend') return 'readAndDraft';
  return 'off';
}

export function writeAssistantSettings(settings: AssistantSettings) {
  write(ASSISTANT_KEY, JSON.stringify(settings));
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

/** The groups of the sidebar's Chats tab ("Invitations", "Halls", "Letters") the viewer folded. */
export function readFoldedGroups(): string[] {
  return stringList(FOLDED_GROUPS_KEY);
}

export function writeFoldedGroup(group: string, folded: boolean) {
  const others = readFoldedGroups().filter((name) => name !== group);
  write(FOLDED_GROUPS_KEY, JSON.stringify(folded ? [...others, group] : others));
}

function welcomedAccounts(): string[] {
  return stringList(WELCOMED_KEY);
}

/** A stored JSON list of strings; anything else reads as empty. */
function stringList(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(read(key) ?? '[]');
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
