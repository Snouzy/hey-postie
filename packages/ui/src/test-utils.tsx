import { type Core, createCore, createFakeDependencies, type Message } from '@hey-postie/core';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CoreProvider } from './core/CoreProvider';

/** A fresh core on fakes, plus the fakes to drive it. */
export function setupCore() {
  const deps = createFakeDependencies();
  return { deps, core: createCore(deps) };
}

export function renderWithCore(ui: ReactNode, core: Core, locale: 'en' | 'fr' = 'en') {
  return render(
    <CoreProvider core={core} locale={locale}>
      {ui}
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
