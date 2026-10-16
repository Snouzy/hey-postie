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

async function sentByMe(body = 'Helo'): Promise<Message> {
  return core.chats.send('bob@x.org', body);
}

function fromBob(): Message {
  return deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'Hi' });
}

describe('editing a letter', () => {
  it('corrects one of my letters and tells the interface', async () => {
    const mine = await sentByMe();
    const updates: Message[] = [];
    core.events.on('message.updated', (message) => updates.push(message));
    const edited = await core.chats.edit('bob@x.org', mine.id, '  Hello  ');
    expect(edited).toMatchObject({ id: mine.id, body: 'Hello', edited: true });
    expect(updates.at(-1)).toMatchObject({ id: mine.id, body: 'Hello' });
  });

  it('refuses an empty body, and someone else’s letter', async () => {
    const mine = await sentByMe();
    await expect(core.chats.edit('bob@x.org', mine.id, '   ')).rejects.toThrow(/EmptyMessage/);
    const theirs = fromBob();
    await expect(core.chats.edit('bob@x.org', theirs.id, 'x')).rejects.toThrow(/NotAllowed/);
  });

  it('leaves an unchanged letter alone', async () => {
    const mine = await sentByMe('Same');
    expect(await core.chats.edit('bob@x.org', mine.id, 'Same')).toMatchObject({ edited: false });
  });
});

describe('deleting a letter for everyone', () => {
  it('takes my letter back and shows it as deleted', async () => {
    const mine = await sentByMe();
    const updates: Message[] = [];
    core.events.on('message.updated', (message) => updates.push(message));
    await core.chats.retract('bob@x.org', mine.id);
    expect(deps.fakes.chat.retracted).toEqual([mine.id]);
    expect(updates.at(-1)).toMatchObject({
      id: mine.id,
      body: '',
      retracted: true,
      retractedBy: 'sender',
    });
  });

  it('refuses someone else’s letter, and one already taken back', async () => {
    const theirs = fromBob();
    await expect(core.chats.retract('bob@x.org', theirs.id)).rejects.toThrow(/NotAllowed/);
    const mine = await sentByMe();
    await core.chats.retract('bob@x.org', mine.id);
    await expect(core.chats.retract('bob@x.org', mine.id)).rejects.toThrow(/NotAllowed/);
  });

  it('passes on a letter that cannot be addressed', async () => {
    const mine = await sentByMe();
    deps.fakes.chat.retractFails = true;
    await expect(core.chats.retract('bob@x.org', mine.id)).rejects.toThrow(/NotRetractable/);
  });
});

describe('deleting a letter for me', () => {
  it('hides it now and after the history reloads, and sends nothing', async () => {
    const theirs = fromBob();
    const hidden: unknown[] = [];
    core.events.on('message.hidden', (event) => hidden.push(event));
    await core.chats.hideForMe('bob@x.org', theirs.id);
    expect(hidden).toEqual([{ chatId: 'bob@x.org', messageId: theirs.id }]);
    expect((await core.chats.messages('bob@x.org')).map((m) => m.id)).not.toContain(theirs.id);
    expect(deps.fakes.chat.retracted).toEqual([]);
  });
});

describe('moderating a hall', () => {
  beforeEach(() => {
    deps.fakes.room.change({
      jid: 'hall@rooms.x.org',
      name: 'Hall',
      nick: 'me',
      joined: true,
      bookmarked: true,
      notify: 'mentions',
      unreadCount: 0,
      mentionsCount: 0,
    });
  });

  it('removes a letter as a moderator, with a trimmed reason', async () => {
    deps.fakes.room.setMembers('hall@rooms.x.org', [
      { nick: 'me', role: 'moderator', affiliation: 'owner' },
    ]);
    await core.rooms.moderate('hall@rooms.x.org', 'm9', '  spam ');
    expect(deps.fakes.room.moderated).toEqual([
      { jid: 'hall@rooms.x.org', messageId: 'm9', reason: 'spam' },
    ]);
  });

  it('is refused to a participant, and a reason past 140 characters', async () => {
    deps.fakes.room.setMembers('hall@rooms.x.org', [
      { nick: 'me', role: 'participant', affiliation: 'member' },
    ]);
    await expect(core.rooms.moderate('hall@rooms.x.org', 'm9')).rejects.toThrow(/NotAllowed/);
    await expect(core.rooms.moderate('hall@rooms.x.org', 'm9', 'x'.repeat(141))).rejects.toThrow(
      /StatusTooLong/,
    );
    expect(deps.fakes.room.moderated).toEqual([]);
  });
});
