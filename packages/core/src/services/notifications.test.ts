import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import { createFakeDependencies } from '../fakes';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('notifications', () => {
  it('notifies when the window is not focused', async () => {
    core.notifications.setWindowFocused(false);
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hello' });
    await tick();
    expect(deps.fakes.notifier.shown).toEqual([
      { title: 'bob', body: 'hello', chatId: 'bob@x.org' },
    ]);
  });

  it('notifies when another chat is open', async () => {
    core.notifications.setWindowFocused(true);
    core.notifications.setOpenChat('amy@x.org');
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hello' });
    await tick();
    expect(deps.fakes.notifier.shown).toHaveLength(1);
  });

  it('stays quiet when the user is looking at that chat', async () => {
    core.notifications.setWindowFocused(true);
    core.notifications.setOpenChat('bob@x.org');
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hello' });
    await tick();
    expect(deps.fakes.notifier.shown).toHaveLength(0);
  });

  it('never notifies for my own messages', async () => {
    core.notifications.setWindowFocused(false);
    const chat = await core.chats.open('bob@x.org');
    await core.chats.send(chat.id, 'mine');
    await tick();
    expect(deps.fakes.notifier.shown).toHaveLength(0);
  });

  it('shortens long bodies and hides undecryptable ones', async () => {
    core.notifications.setWindowFocused(false);
    deps.fakes.chat.receive({ chatId: 'c', fromJid: 'bob@x.org', body: 'x'.repeat(200) });
    deps.fakes.chat.receive({
      chatId: 'c',
      fromJid: 'bob@x.org',
      body: 'secret',
      encryption: 'undecryptable',
    });
    await tick();
    expect(deps.fakes.notifier.shown[0]?.body).toHaveLength(140);
    expect(deps.fakes.notifier.shown[1]?.body).not.toContain('secret');
  });
});

describe('notifications in rooms', () => {
  const hall = async () => {
    core.notifications.setWindowFocused(false);
    return core.rooms.join({ jid: 'hall@rooms.localhost', nick: 'alice' });
  };
  const roomMessage = (body: string, isMention: boolean) =>
    deps.fakes.chat.receive({
      chatId: 'hall@rooms.localhost',
      fromJid: 'hall@rooms.localhost/bob',
      fromNick: 'bob',
      body,
      isMention,
    });

  it('notifies on a mention only, by default', async () => {
    await hall();
    roomMessage('hello all', false);
    roomMessage('alice: hi', true);
    await tick();
    expect(deps.fakes.notifier.shown).toHaveLength(1);
    expect(deps.fakes.notifier.shown[0]?.title).toBe('bob · hall');
  });

  it('notifies on everything when the rule is all', async () => {
    await hall();
    await core.rooms.setNotify('hall@rooms.localhost', 'all');
    roomMessage('hello all', false);
    await tick();
    expect(deps.fakes.notifier.shown).toHaveLength(1);
  });

  it('stays quiet when the rule is none, even on a mention', async () => {
    await hall();
    await core.rooms.setNotify('hall@rooms.localhost', 'none');
    roomMessage('alice: hi', true);
    await tick();
    expect(deps.fakes.notifier.shown).toHaveLength(0);
  });
});
