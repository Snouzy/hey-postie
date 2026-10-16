import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import type { Chat } from '../contracts/types';
import { createFakeDependencies } from '../fakes';
import { ASSISTANT_DEFAULT_PORT, ASSISTANT_TOKEN_KEY } from './assistant';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

function chat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'bob@x.org',
    kind: 'direct',
    peerJid: 'bob@x.org',
    title: 'Bob',
    unreadCount: 0,
    encrypted: false,
    ...overrides,
  };
}

const message = { chatId: 'bob@x.org', title: 'Bob', body: 'On my way' };

describe('assistant settings', () => {
  it('starts off, sealed chats excluded, on the default port', () => {
    expect(core.assistant.getSettings()).toEqual({
      mode: 'off',
      includeSealed: false,
      port: ASSISTANT_DEFAULT_PORT,
    });
  });

  it('applies a change and tells the app', () => {
    const changes: unknown[] = [];
    core.events.on('assistant.changed', (settings) => changes.push(settings));
    core.assistant.setSettings({ mode: 'read', port: 8000 });
    expect(core.assistant.getSettings()).toMatchObject({ mode: 'read', port: 8000 });
    expect(changes).toEqual([{ mode: 'read', includeSealed: false, port: 8000 }]);
  });

  it('refuses a port outside 1024–65535 and keeps the old settings', () => {
    for (const port of [80, 70000, 1.5]) {
      expect(() => core.assistant.setSettings({ port })).toThrow(/InvalidPort/);
    }
    expect(core.assistant.getSettings().port).toBe(ASSISTANT_DEFAULT_PORT);
  });
});

describe('what Claude may read', () => {
  it('sees nothing while off', () => {
    expect(core.assistant.canRead(chat())).toBe(false);
  });

  it('leaves sealed chats out unless the user includes them', () => {
    core.assistant.setSettings({ mode: 'read' });
    expect(core.assistant.canRead(chat())).toBe(true);
    expect(core.assistant.canRead(chat({ encrypted: true }))).toBe(false);
    core.assistant.setSettings({ includeSealed: true });
    expect(core.assistant.canRead(chat({ encrypted: true }))).toBe(true);
  });
});

describe('the token', () => {
  it('is made once, kept in the keychain, and replaced on demand', async () => {
    const first = await core.assistant.token();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await deps.keychain.get(ASSISTANT_TOKEN_KEY)).toBe(first);
    expect(await core.assistant.token()).toBe(first);
    const changes: unknown[] = [];
    core.events.on('assistant.changed', (settings) => changes.push(settings));
    const second = await core.assistant.newToken();
    expect(second).not.toBe(first);
    expect(changes).toHaveLength(1);
    expect(await core.assistant.token()).toBe(second);
  });
});

describe('drafts', () => {
  const draft = { chatId: 'bob@x.org', title: 'Bob', body: 'On my way' };

  it('are refused unless the mode allows them', () => {
    core.assistant.setSettings({ mode: 'read' });
    expect(() => core.assistant.draft(draft)).toThrow(/AssistantNotAllowed/);
  });

  it('reach the interface and open the chat, and nothing is sent', () => {
    core.assistant.setSettings({ mode: 'readAndDraft' });
    const seen: unknown[] = [];
    core.events.on('assistant.draft', (payload) => seen.push(payload));
    core.events.on('chat.requested', (payload) => seen.push(payload));
    core.assistant.draft(draft);
    expect(seen).toEqual([draft, { chatId: 'bob@x.org' }]);
    expect(deps.fakes.chat.sent).toHaveLength(0);
  });
});
