import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../container';
import type { Chat, Message } from '../contracts/types';
import { createFakeDependencies } from '../fakes';
import { sanitizeReactions } from './chats';
import { COMPOSING_REPEAT_MS, PAUSED_AFTER_MS } from './typing';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

/** `chat.updated` asks the roster first: one turn of the microtask queue. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const bob = (): void =>
  deps.fakes.roster.seed({
    jid: 'bob@example.org',
    name: 'Bob',
    presence: 'online',
    subscription: 'both',
  });

describe('message requests', () => {
  it('flags a direct chat with someone outside the roster, in list and open', async () => {
    bob();
    deps.fakes.chat.receive({ chatId: 'bob@example.org', fromJid: 'bob@example.org', body: 'a' });
    deps.fakes.chat.receive({ chatId: 'eve@example.org', fromJid: 'eve@example.org', body: 'b' });
    const chats = await core.chats.list();
    expect(chats.map((c) => [c.id, c.fromStranger])).toEqual([
      ['eve@example.org', true],
      ['bob@example.org', false],
    ]);
    expect((await core.chats.open('eve@example.org')).fromStranger).toBe(true);
    expect((await core.chats.open('bob@example.org')).fromStranger).toBe(false);
  });

  it('never flags a room', async () => {
    deps.fakes.chat.receive({
      chatId: 'hall@rooms.example.org',
      fromJid: 'hall@rooms.example.org/eve',
      body: 'a',
      kind: 'room',
    });
    const [room] = await core.chats.list();
    expect(room?.fromStranger).toBeUndefined();
  });

  it('carries the flag on chat.updated and drops it once accepted', async () => {
    const seen: Chat[] = [];
    core.events.on('chat.updated', (chat) => seen.push(chat));
    deps.fakes.chat.receive({ chatId: 'eve@example.org', fromJid: 'eve@example.org', body: 'a' });
    await tick();
    deps.fakes.roster.request({ jid: 'eve@example.org', name: 'Eve' });
    await core.contacts.accept('eve@example.org');
    deps.fakes.chat.receive({ chatId: 'eve@example.org', fromJid: 'eve@example.org', body: 'b' });
    await tick();
    expect(seen.map((c) => c.fromStranger)).toEqual([true, false]);
  });

  describe('isRequest', () => {
    const eve = { chatId: 'eve@example.org', fromJid: 'eve@example.org' };

    it('is true for a stranger who wrote and was never answered', async () => {
      deps.fakes.chat.receive({ ...eve, body: 'a' });
      const [chat] = await core.chats.list();
      expect(chat?.isRequest).toBe(true);
      expect((await core.chats.open('eve@example.org')).isRequest).toBe(true);
    });

    it('is false for a chat the user started, even once the stranger answers', async () => {
      await core.chats.open('eve@example.org');
      await core.chats.send('eve@example.org', 'hello');
      deps.fakes.chat.receive({ ...eve, body: 'hi back' });
      const [chat] = await core.chats.list();
      expect(chat?.lastMessage?.direction).toBe('in');
      expect(chat?.fromStranger).toBe(true);
      expect(chat?.isRequest).toBe(false);
    });

    it('is false for a chat opened with a stranger who has not written', async () => {
      const chat = await core.chats.open('eve@example.org');
      expect(chat.fromStranger).toBe(true);
      expect(chat.isRequest).toBe(false);
    });

    it('is false once the user answers, and chat.updated says so', async () => {
      const seen: Array<boolean | undefined> = [];
      core.events.on('chat.updated', (chat) => seen.push(chat.isRequest));
      deps.fakes.chat.receive({ ...eve, body: 'a' });
      await tick();
      await core.chats.send('eve@example.org', 'welcome');
      await tick();
      deps.fakes.chat.receive({ ...eve, body: 'b' });
      await tick();
      expect(seen).toEqual([true, false, false]);
    });

    it('reads an older reply from the latest page of the history', async () => {
      deps.fakes.chat.receive({ ...eve, body: 'a' });
      deps.fakes.chat.receive({ ...eve, body: 'b' });
      // An answer the repository already holds, which no event of this session carried.
      deps.fakes.chat.history('eve@example.org', [
        {
          id: 'old',
          chatId: 'eve@example.org',
          fromJid: 'me@example.org',
          body: 'answered long ago',
          sentAt: new Date(2026, 0, 1),
          direction: 'out',
          status: 'sent',
          encryption: 'none',
          attachments: [],
          reactions: [],
          isMention: false,
        },
      ]);
      await core.chats.messages('eve@example.org');
      expect((await core.chats.open('eve@example.org')).isRequest).toBe(true);
      await core.chats.loadOlder('eve@example.org');
      expect((await core.chats.open('eve@example.org')).isRequest).toBe(false);
    });

    it('is false for a contact and absent for a room', async () => {
      bob();
      deps.fakes.chat.receive({ chatId: 'bob@example.org', fromJid: 'bob@example.org', body: 'a' });
      deps.fakes.chat.receive({
        chatId: 'hall@rooms.example.org',
        fromJid: 'hall@rooms.example.org/eve',
        body: 'a',
        kind: 'room',
      });
      const chats = await core.chats.list();
      expect(chats.find((c) => c.kind === 'direct')?.isRequest).toBe(false);
      expect(chats.find((c) => c.kind === 'room')?.isRequest).toBeUndefined();
    });
  });
});

describe('typing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const states = () => deps.fakes.chat.states.map((s) => (s.composing ? 'composing' : 'paused'));

  it('sends composing once per window while the user keeps typing', () => {
    // A keystroke every second: the pause never fires, composing repeats once per window.
    for (let elapsed = 0; elapsed < COMPOSING_REPEAT_MS; elapsed += 1000) {
      core.chats.setComposing('c', true);
      vi.advanceTimersByTime(1000);
    }
    expect(states()).toEqual(['composing']);
    core.chats.setComposing('c', true);
    expect(states()).toEqual(['composing', 'composing']);
  });

  it('sends paused after the silence, then composing again on the next keystroke', () => {
    core.chats.setComposing('c', true);
    vi.advanceTimersByTime(PAUSED_AFTER_MS - 1);
    expect(states()).toEqual(['composing']);
    vi.advanceTimersByTime(1);
    expect(states()).toEqual(['composing', 'paused']);
    core.chats.setComposing('c', true);
    expect(states()).toEqual(['composing', 'paused', 'composing']);
  });

  it('sends paused at once when the draft is cleared, and only once', () => {
    core.chats.setComposing('c', true);
    core.chats.setComposing('c', false);
    core.chats.setComposing('c', false);
    vi.advanceTimersByTime(PAUSED_AFTER_MS);
    expect(states()).toEqual(['composing', 'paused']);
  });

  it('sends nothing extra when the message goes out', async () => {
    core.chats.setComposing('c', true);
    await core.chats.send('c', 'hello');
    vi.advanceTimersByTime(PAUSED_AFTER_MS);
    expect(states()).toEqual(['composing']);
  });

  it('keeps one state per chat', () => {
    core.chats.setComposing('a', true);
    core.chats.setComposing('b', true);
    expect(deps.fakes.chat.states.map((s) => s.chatId)).toEqual(['a', 'b']);
  });

  it('turns a peer chat state into chat.typing', () => {
    const seen: boolean[] = [];
    core.events.on('chat.typing', (e) => seen.push(e.typing));
    deps.fakes.chat.receiveChatState('c', 'bob@example.org', 'composing');
    deps.fakes.chat.receiveChatState('c', 'bob@example.org', 'paused');
    deps.fakes.chat.receiveChatState('c', 'bob@example.org', 'active');
    expect(seen).toEqual([true, false, false]);
  });
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
    await tick();
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
    // Received while the chat is not open, so that it counts as unread (like the real repository).
    deps.fakes.chat.receive({ chatId: 'bob@example.org', fromJid: 'bob@example.org', body: 'a' });
    const chat = await core.chats.open('bob@example.org');
    const unread: number[] = [];
    core.events.on('chat.updated', (c) => unread.push(c.unreadCount));
    await core.chats.markRead(chat.id);
    await tick();
    expect(deps.fakes.chat.markedRead).toEqual([chat.id]);
    expect(unread.at(-1)).toBe(0);
  });
});

describe('chats.toggleReaction', () => {
  it('adds my emoji, then removes it, keeping the reactions of others', async () => {
    const chat = await core.chats.open('bob@x.org');
    const incoming = deps.fakes.chat.receive({
      chatId: chat.id,
      fromJid: 'bob@x.org',
      body: 'hi',
      reactions: [{ emoji: '👍', fromJids: ['carol@x.org'], mine: false }],
    });
    const seen: string[][] = [];
    core.events.on('message.updated', (m) =>
      seen.push(m.reactions.map((r) => `${r.emoji}:${r.fromJids.join('+')}`)),
    );
    await core.chats.toggleReaction(chat.id, incoming.id, '👍');
    expect(seen.at(-1)).toEqual(['👍:carol@x.org+me@example.org']);
    await core.chats.toggleReaction(chat.id, incoming.id, '❤️');
    expect(deps.fakes.chat.reactions.at(-1)?.emojis).toEqual(['👍', '❤️']);
    await core.chats.toggleReaction(chat.id, incoming.id, '👍');
    expect(deps.fakes.chat.reactions.at(-1)?.emojis).toEqual(['❤️']);
    expect(seen.at(-1)).toEqual(['👍:carol@x.org', '❤️:me@example.org']);
  });

  it('composes two quick taps instead of racing them', async () => {
    const chat = await core.chats.open('bob@x.org');
    const incoming = deps.fakes.chat.receive({ chatId: chat.id, fromJid: 'bob@x.org', body: 'hi' });
    await Promise.all([
      core.chats.toggleReaction(chat.id, incoming.id, '👍'),
      core.chats.toggleReaction(chat.id, incoming.id, '❤️'),
    ]);
    expect(deps.fakes.chat.reactions.at(-1)?.emojis).toEqual(['👍', '❤️']);
  });

  it('refuses an unknown message', async () => {
    const chat = await core.chats.open('bob@x.org');
    await expect(core.chats.toggleReaction(chat.id, 'nope', '👍')).rejects.toThrow(/Unknown/);
  });

  it('refuses an empty emoji', async () => {
    await expect(core.chats.toggleReaction('c', 'm', ' ')).rejects.toThrow(/EmptyMessage/);
  });
});

describe('sanitizeReactions', () => {
  const r = (emoji: string, fromJids: string[], mine = false) => ({ emoji, fromJids, mine });

  it('drops empty, oversized and whitespace emojis, merges duplicates, keeps mine', () => {
    const clean = sanitizeReactions([
      r('👍', ['a@x.org']),
      r('👍', ['b@x.org', 'a@x.org'], true),
      r('', ['c@x.org']),
      r('x'.repeat(17), ['c@x.org']),
      r('a b', ['c@x.org']),
    ]);
    expect(clean).toEqual([{ emoji: '👍', fromJids: ['a@x.org', 'b@x.org'], mine: true }]);
  });

  it('caps the number of reactions and of reactors', () => {
    const many = Array.from({ length: 50 }, (_, i) => r(`e${i}`, ['a@x.org']));
    expect(sanitizeReactions(many)).toHaveLength(32);
    const crowd = r(
      '👍',
      Array.from({ length: 100 }, (_, i) => `u${i}@x.org`),
    );
    expect(sanitizeReactions([crowd])[0]?.fromJids).toHaveLength(64);
  });

  it('returns the same array when nothing changes', () => {
    const reactions = [r('👍', ['a@x.org'])];
    expect(sanitizeReactions(reactions)).toBe(reactions);
  });
});
