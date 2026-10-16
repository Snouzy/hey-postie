import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../container';
import type { SendRequest } from '../contracts/services';
import type { Chat } from '../contracts/types';
import { createFakeDependencies } from '../fakes';
import { ASSISTANT_DEFAULT_PORT, ASSISTANT_TOKEN_KEY, SEND_APPROVAL_TIMEOUT_MS } from './assistant';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

afterEach(() => {
  vi.useRealTimers();
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
    const second = await core.assistant.newToken();
    expect(second).not.toBe(first);
    expect(await core.assistant.token()).toBe(second);
  });
});

describe("sending on the user's behalf", () => {
  function requests() {
    const seen: SendRequest[] = [];
    core.events.on('assistant.sendRequested', (request) => seen.push(request));
    return seen;
  }

  it('is refused unless the mode allows sending', async () => {
    core.assistant.setSettings({ mode: 'read' });
    await expect(core.assistant.requestSend(message)).rejects.toThrow(/AssistantNotAllowed/);
  });

  it('asks the user and goes ahead on yes', async () => {
    core.assistant.setSettings({ mode: 'readAndSend' });
    const seen = requests();
    const settled: string[] = [];
    core.events.on('assistant.sendSettled', ({ id }) => settled.push(id));
    const answer = core.assistant.requestSend(message);
    expect(seen).toEqual([{ id: expect.any(String), ...message }]);
    core.assistant.answerSend(seen[0]?.id ?? '', true);
    await expect(answer).resolves.toBe(true);
    expect(settled).toEqual([seen[0]?.id]);
  });

  it('stops on no, and ignores a second answer', async () => {
    core.assistant.setSettings({ mode: 'readAndSend' });
    const seen = requests();
    const answer = core.assistant.requestSend(message);
    const id = seen[0]?.id ?? '';
    core.assistant.answerSend(id, false);
    core.assistant.answerSend(id, true);
    await expect(answer).resolves.toBe(false);
  });

  it('counts silence as no after the timeout', async () => {
    vi.useFakeTimers();
    core.assistant.setSettings({ mode: 'readAndSend' });
    const answer = core.assistant.requestSend(message);
    vi.advanceTimersByTime(SEND_APPROVAL_TIMEOUT_MS);
    await expect(answer).resolves.toBe(false);
  });
});
