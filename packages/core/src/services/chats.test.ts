import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import type { Message } from '../contracts/types';
import { createFakeDependencies } from '../fakes';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

describe('chats.send', () => {
  it('trims the body and sends it', async () => {
    const chat = await core.chats.open('Bob@Example.org');
    const message = await core.chats.send(chat.id, '  hello  ');
    expect(message.body).toBe('hello');
    expect(deps.fakes.chat.sent).toHaveLength(1);
  });

  it('refuses an empty body without sending', async () => {
    const chat = await core.chats.open('bob@example.org');
    await expect(core.chats.send(chat.id, '   ')).rejects.toThrow(/EmptyMessage/);
    expect(deps.fakes.chat.sent).toHaveLength(0);
  });
});

describe('incoming messages', () => {
  it('emits message.received with control characters removed', async () => {
    const seen: Message[] = [];
    core.events.on('message.received', (m) => seen.push(m));
    deps.fakes.chat.receive({
      chatId: 'bob@example.org',
      fromJid: 'bob@example.org',
      body: 'hi\u0007 there',
    });
    expect(seen[0]?.body).toBe('hi there');
  });

  it('keeps emoji and newlines', async () => {
    const seen: Message[] = [];
    core.events.on('message.received', (m) => seen.push(m));
    deps.fakes.chat.receive({ chatId: 'c', fromJid: 'bob@example.org', body: 'line 1\nline 2 🙂' });
    expect(seen[0]?.body).toBe('line 1\nline 2 🙂');
  });

  it('emits chat.updated with the unread count', async () => {
    const unread: number[] = [];
    core.events.on('chat.updated', (chat) => unread.push(chat.unreadCount));
    deps.fakes.chat.receive({ chatId: 'c', fromJid: 'bob@example.org', body: 'a' });
    deps.fakes.chat.receive({ chatId: 'c', fromJid: 'bob@example.org', body: 'b' });
    expect(unread).toEqual([1, 2]);
  });
});

describe('chats.list', () => {
  it('sorts by last activity, most recent first', async () => {
    deps.fakes.chat.receive({ chatId: 'old', fromJid: 'old@example.org', body: 'a' });
    deps.fakes.chat.receive({ chatId: 'new', fromJid: 'new@example.org', body: 'b' });
    const chats = await core.chats.list();
    expect(chats.map((c) => c.id)).toEqual(['new', 'old']);
  });
});

describe('history', () => {
  it('loadOlder fetches the page before the oldest loaded message', async () => {
    const chat = await core.chats.open('bob@example.org');
    deps.fakes.chat.receive({ chatId: chat.id, fromJid: 'bob@example.org', body: 'recent' });
    deps.fakes.chat.history(chat.id, [
      {
        id: 'h1',
        chatId: chat.id,
        fromJid: 'bob@example.org',
        body: 'older',
        sentAt: new Date(2026, 0, 1),
        direction: 'in',
        status: 'read',
        encryption: 'none',
        attachments: [],
        reactions: [],
        isMention: false,
      },
    ]);
    const first = await core.chats.messages(chat.id);
    expect(first.map((m) => m.body)).toEqual(['recent']);
    const older = await core.chats.loadOlder(chat.id);
    expect(older.map((m) => m.body)).toEqual(['older']);
    expect(await core.chats.loadOlder(chat.id)).toEqual([]);
  });

  it('loadOlder before messages() returns nothing', async () => {
    expect(await core.chats.loadOlder('nowhere')).toEqual([]);
  });
});

describe('chats.markRead', () => {
  it('asks the repository and the chat goes to zero unread', async () => {
    const chat = await core.chats.open('bob@example.org');
    deps.fakes.chat.receive({ chatId: chat.id, fromJid: 'bob@example.org', body: 'a' });
    const unread: number[] = [];
    core.events.on('chat.updated', (c) => unread.push(c.unreadCount));
    await core.chats.markRead(chat.id);
    expect(deps.fakes.chat.markedRead).toEqual([chat.id]);
    expect(unread.at(-1)).toBe(0);
  });
});
