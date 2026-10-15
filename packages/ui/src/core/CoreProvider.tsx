import type { Core } from '@hey-postie/core';
import { createContext, type ReactNode, useContext } from 'react';
import type { Locale, MessageKey } from '../i18n';
import { t } from '../i18n';

interface CoreContextValue {
  core: Core;
  locale: Locale;
}

const CoreContext = createContext<CoreContextValue | null>(null);

interface CoreProviderProps {
  core: Core;
  locale: Locale;
  children: ReactNode;
}

/** Hands the core services and the locale to every screen. The only way the UI reaches the core. */
export function CoreProvider({ core, locale, children }: CoreProviderProps) {
  return <CoreContext.Provider value={{ core, locale }}>{children}</CoreContext.Provider>;
}

export function useCore(): Core {
  return useContextValue().core;
}

export function useLocale(): Locale {
  return useContextValue().locale;
}

/** Translates a key in the current locale. */
export function useText(): (key: MessageKey) => string {
  const { locale } = useContextValue();
  return (key) => t(locale, key);
}

function useContextValue(): CoreContextValue {
  const value = useContext(CoreContext);
  if (!value) throw new Error('useCore must be used inside <CoreProvider>');
  return value;
}
