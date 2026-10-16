import { createContext, type ReactNode, useContext } from 'react';
import type { Density, LettersLayout, LocaleChoice, Theme } from './settings';

export interface SettingsValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  locale: LocaleChoice;
  setLocale: (choice: LocaleChoice) => void;
  showPreview: boolean;
  setShowPreview: (value: boolean) => void;
  /** Whether others are told when I have read their letters (XEP-0333 `displayed`). */
  sendReadMarkers: boolean;
  setSendReadMarkers: (value: boolean) => void;
  /** Bubbles, lines, or bubbles in direct chats and lines in halls. */
  lettersLayout: LettersLayout;
  setLettersLayout: (layout: LettersLayout) => void;
  density: Density;
  setDensity: (density: Density) => void;
  /** The app's version, from the desktop; "dev" when it did not say. */
  version: string;
}

const SettingsContext = createContext<SettingsValue | null>(null);

/** Hands the user's choices (and their setters) to the Settings dialog, wherever it is mounted. */
export function SettingsProvider({
  value,
  children,
}: {
  value: SettingsValue;
  children: ReactNode;
}) {
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}
