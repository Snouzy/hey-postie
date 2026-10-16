import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import { createFakeDependencies } from '../fakes';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

const fromBob = (body: string) =>
  deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body });

describe('chats.send with a reply', () => {
  it('sends the letter as a reply to the one named, which it carries', async () => {
    const original = fromBob('Shall we?');
    const sent = await core.chats.send('bob@x.org', ' Yes ', { replyTo: original.id });
    expect(sent.body).toBe('Yes');
    expect(sent.replyTo).toMatchObject({ id: original.id, excerpt: 'Shall we?' });
  });

  it('refuses a letter that is not there, and one that was deleted', async () => {
    await expect(core.chats.send('bob@x.org', 'hi', { replyTo: 'nope' })).rejects.toThrow(
      /Unknown/,
    );
    const gone = fromBob('oops');
    deps.fakes.chat.update({ ...gone, body: '', retracted: true, retractedBy: 'sender' });
    await expect(core.chats.send('bob@x.org', 'hi', { replyTo: gone.id })).rejects.toThrow(
      /NotAllowed/,
    );
    expect(deps.fakes.chat.sent).toHaveLength(0);
  });

  it('cleans the excerpt it hands back: it quotes someone else', async () => {
    const original = fromBob('a\u0007b');
    const sent = await core.chats.send('bob@x.org', 'ok', { replyTo: original.id });
    expect(sent.replyTo?.excerpt).toBe('ab');
  });
});

describe('the first unread letter', () => {
  it('is on the chat while it is unread, and goes once read', async () => {
    const first = fromBob('one');
    fromBob('two');
    const [chat] = await core.chats.list();
    expect(chat?.firstUnreadId).toBe(first.id);
    await core.chats.markRead('bob@x.org');
    const [read] = await core.chats.list();
    expect(read?.firstUnreadId).toBeUndefined();
  });
});
