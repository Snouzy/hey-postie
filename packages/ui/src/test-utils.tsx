import { type Core, createCore, createFakeDependencies, type Message } from '@hey-postie/core';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CoreProvider } from './core/CoreProvider';
import { SettingsProvider, type SettingsValue } from './core/SettingsProvider';

/** A fresh core on fakes, plus the fakes to drive it. */
export function setupCore() {
  const deps = createFakeDependencies();
  return { deps, core: createCore(deps) };
}

const noop = () => {};

/** The choices `App` would hand down, at their defaults; a test overrides what it is about. */
export function defaultSettings(overrides: Partial<SettingsValue> = {}): SettingsValue {
  return {
    theme: 'system',
    setTheme: noop,
    locale: 'system',
    setLocale: noop,
    showPreview: true,
    setShowPreview: noop,
    sendReadMarkers: true,
    setSendReadMarkers: noop,
    lettersLayout: 'auto',
    setLettersLayout: noop,
    density: 'comfortable',
    setDensity: noop,
    version: 'test',
    ...overrides,
  };
}

export function renderWithCore(
  ui: ReactNode,
  core: Core,
  locale: 'en' | 'fr' = 'en',
  settings: SettingsValue = defaultSettings(),
) {
  return render(
    <CoreProvider core={core} locale={locale}>
      <SettingsProvider value={settings}>{ui}</SettingsProvider>
    </CoreProvider>,
  );
}

let counter = 0;

/** A message with sensible defaults; override what the test is about. */
export function message(overrides: Partial<Message> = {}): Message {
  counter += 1;
  return {
    id: `t${counter}`,
    chatId: 'bob@example.org',
    fromJid: 'bob@example.org',
    body: `message ${counter}`,
    sentAt: new Date(2026, 9, 15, 12, 0, counter),
    direction: 'in',
    status: 'delivered',
    encryption: 'none',
    attachments: [],
    reactions: [],
    isMention: false,
    ...overrides,
  };
}
