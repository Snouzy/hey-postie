import { describe, expect, it } from 'vitest';
import { isMention, toChat, toContact, toMessage } from './mappers';
import type { ChatModel, ContactModel, MessageModel } from './models';

/** A skeletor model is just `get()` for the mappers. */
function model(attrs: Record<string, unknown>): MessageModel {
  return {
    get: (key) => attrs[key],
    save: () => undefined,
    on: () => undefined,
    off: () => undefined,
  };
}

const context = { chatId: 'juliet@example.org', authenticated: true, unread: 0 };
const incoming = {
  id: 'm1',
  from: 'juliet@example.org/balcony',
  body: 'hello',
  time: '2026-10-15T10:00:00.000Z',
  sender: 'them',
};

describe('toMessage', () => {
  it('maps an incoming message', () => {
    const message = toMessage(model(incoming), context);
    expect(message).toMatchObject({
      id: 'm1',
      chatId: 'juliet@example.org',
      fromJid: 'juliet@example.org',
      body: 'hello',
      direction: 'in',
      status: 'read',
      encryption: 'none',
      attachments: [],
      reactions: [],
      isMention: false,
    });
    expect(message.sentAt.toISOString()).toBe('2026-10-15T10:00:00.000Z');
  });

  it('marks incoming messages delivered while the chat has unread ones', () => {
    expect(toMessage(model(incoming), { ...context, unread: 2 }).status).toBe('delivered');
  });

  it('maps own messages: sent, delivered once received, pending offline', () => {
    const own = { ...incoming, sender: 'me', from: 'romeo@example.org/desk' };
    expect(toMessage(model(own), context).status).toBe('sent');
    expect(toMessage(model({ ...own, received: '2026-10-15T10:00:01Z' }), context).status).toBe(
      'delivered',
    );
    expect(toMessage(model(own), { ...context, authenticated: false }).status).toBe('pending');
    expect(toMessage(model(own), context).direction).toBe('out');
  });

  it('maps errors to failed, except decryption errors which are undecryptable', () => {
    expect(toMessage(model({ ...incoming, is_error: true }), context).status).toBe('failed');
    const sealed = toMessage(
      model({ ...incoming, is_error: true, error_type: 'Decryption', body: 'notice' }),
      context,
    );
    expect(sealed.status).toBe('read');
    expect(sealed.encryption).toBe('undecryptable');
    expect(sealed.body).toBe('');
  });

  it('prefers the decrypted plaintext and flags OMEMO', () => {
    const message = toMessage(
      model({ ...incoming, is_encrypted: true, body: 'fallback', plaintext: 'secret' }),
      context,
    );
    expect(message.body).toBe('secret');
    expect(message.encryption).toBe('omemo');
  });

  it('turns an http(s) oob_url into one attachment, a bare link in the body does not', () => {
    const url = 'https://files.example.org/upload/abc/photo%20one.JPG?x=1';
    const oob = toMessage(model({ ...incoming, body: url, oob_url: url }), context);
    expect(oob.attachments).toEqual([
      { url, name: 'photo one.JPG', size: 0, mimeType: 'image/jpeg', encryption: 'none' },
    ]);
    expect(toMessage(model({ ...incoming, body: url }), context).attachments).toEqual([]);
  });

  it('keeps a malformed file name as is instead of throwing', () => {
    const url = 'https://files.example.org/upload/bad%E0name.png';
    const [attachment] = toMessage(model({ ...incoming, oob_url: url }), context).attachments;
    expect(attachment?.name).toBe('bad%E0name.png');
  });

  it('sanitizes the attachment name taken from the URL', () => {
    const name = (url: string) =>
      toMessage(model({ ...incoming, oob_url: url }), context).attachments[0]?.name;
    expect(name('https://x.org/up/..%2F..%5Cetc%00passwd.png')).toBe('etcpasswd.png');
    expect(name('https://x.org/up/%2E%2Ehidden')).toBe('hidden');
    expect(name('https://x.org/up/')).toBe('file');
    expect(name(`https://x.org/up/${'a'.repeat(300)}.png`)?.length).toBe(120);
  });

  it('marks aesgcm bodies as encrypted attachments and keeps the key out of the URL', () => {
    const url = 'aesgcm://files.example.org/upload/abc/report.bin#0123abcd';
    const [attachment] = toMessage(model({ ...incoming, body: url }), context).attachments;
    expect(attachment).toEqual({
      url: 'aesgcm://files.example.org/upload/abc/report.bin',
      name: 'report.bin',
      size: 0,
      mimeType: 'application/octet-stream',
      encryption: 'aesgcm',
      decryptionKey: '0123abcd',
    });
  });

  it('empties a retracted message and flags corrections', () => {
    const url = 'https://files.example.org/f.png';
    const gone = toMessage(
      model({ ...incoming, body: url, oob_url: url, retracted: true }),
      context,
    );
    expect(gone).toMatchObject({ body: '', attachments: [], retracted: true, edited: false });
    const fixed = toMessage(model({ ...incoming, edited: '2026-10-15T10:01:00Z' }), context);
    expect(fixed).toMatchObject({ body: 'hello', retracted: false, edited: true });
  });

  it('does not treat text with a URL inside as an attachment', () => {
    const message = toMessage(model({ ...incoming, body: 'look https://a.b/c' }), context);
    expect(message.attachments).toEqual([]);
  });

  it('groups reactions by emoji, sorted by emoji', () => {
    const reactions = {
      'romeo@example.org': ['👍', '❤️'],
      'juliet@example.org': ['👍'],
    };
    expect(toMessage(model({ ...incoming, reactions }), context).reactions).toEqual([
      { emoji: '❤️', fromJids: ['romeo@example.org'], mine: false },
      { emoji: '👍', fromJids: ['romeo@example.org', 'juliet@example.org'], mine: false },
    ]);
    expect(toMessage(model({ ...incoming, reactions: 'junk' }), context).reactions).toEqual([]);
  });

  it('empties the body of a message that only carries its attachment', () => {
    const url = 'https://files.example.org/upload/abc/cat.png';
    expect(toMessage(model({ ...incoming, body: url, oob_url: url }), context).body).toBe('');
    const encrypted = 'aesgcm://files.example.org/upload/abc/cat.png#00ff';
    expect(toMessage(model({ ...incoming, body: encrypted }), context).body).toBe('');
    const captioned = toMessage(model({ ...incoming, body: 'look', oob_url: url }), context);
    expect(captioned).toMatchObject({ body: 'look', attachments: [{ url }] });
  });

  it('keeps the nick when there is one', () => {
    expect(toMessage(model({ ...incoming, nick: 'Juliet' }), context).fromNick).toBe('Juliet');
    expect('fromNick' in toMessage(model(incoming), context)).toBe(false);
  });
});

describe('toChat', () => {
  it('maps a direct chat', () => {
    const attrs = { jid: 'juliet@example.org', num_unread: 3, omemo_active: true };
    const chat = { ...model(attrs), getDisplayName: () => 'Juliet' } as unknown as ChatModel;
    expect(toChat(chat)).toEqual({
      id: 'juliet@example.org',
      kind: 'direct',
      peerJid: 'juliet@example.org',
      title: 'Juliet',
      unreadCount: 3,
      encrypted: true,
    });
  });

  it('falls back to the local part and attaches the last message', () => {
    const chat = { ...model({ jid: 'juliet@example.org' }), getDisplayName: () => null };
    const last = toMessage(model(incoming), context);
    const mapped = toChat(chat as unknown as ChatModel, last);
    expect(mapped.title).toBe('juliet');
    expect(mapped.unreadCount).toBe(0);
    expect(mapped.encrypted).toBe(false);
    expect(mapped.lastMessage).toBe(last);
  });
});

describe('toContact', () => {
  function contact(status: string, subscription?: string): ContactModel {
    return {
      ...model({ jid: 'juliet@example.org', subscription }),
      getDisplayName: () => 'Juliet',
      getStatus: () => status,
      isUnsaved: () => subscription === undefined,
    };
  }

  it('maps presence and subscription', () => {
    expect(toContact(contact('online', 'both'))).toEqual({
      jid: 'juliet@example.org',
      name: 'Juliet',
      presence: 'online',
      subscription: 'both',
    });
    expect(toContact(contact('chat', 'to')).presence).toBe('online');
    expect(toContact(contact('away', 'from')).presence).toBe('away');
    expect(toContact(contact('xa', 'none')).presence).toBe('away');
    expect(toContact(contact('dnd', 'both')).presence).toBe('dnd');
    expect(toContact(contact('offline', 'both')).presence).toBe('offline');
    expect(toContact(contact('offline')).subscription).toBe('none');
  });
});

describe('toMessage in a room', () => {
  const room = { ...context, chatId: 'hall@rooms.example.org', ownNick: 'romeo' };
  const groupchat = {
    ...incoming,
    from: 'hall@rooms.example.org/juliet',
    nick: 'juliet',
    body: 'Romeo, where are you?',
  };

  it('sets the nick, the occupant address as sender and the mention', () => {
    expect(toMessage(model(groupchat), room)).toMatchObject({
      chatId: 'hall@rooms.example.org',
      fromJid: 'hall@rooms.example.org/juliet',
      fromNick: 'juliet',
      direction: 'in',
      isMention: true,
    });
  });

  it('keeps the occupant address in an anonymous room, so two occupants never share a fromJid', () => {
    expect(toMessage(model(groupchat), room).fromJid).toBe('hall@rooms.example.org/juliet');
    expect(
      toMessage(
        model({ ...groupchat, nick: 'romeo', sender: 'me', from: 'hall@rooms.example.org/romeo' }),
        room,
      ).fromJid,
    ).toBe('hall@rooms.example.org/romeo');
  });

  it('flags our reactions through the occupant address, not the nick', () => {
    const reactions = {
      'hall@rooms.example.org/romeo': ['🎉'],
      'hall@rooms.example.org/juliet': ['🎉', '👍'],
    };
    const own = { ...room, ownReactionJid: 'hall@rooms.example.org/romeo' };
    expect(toMessage(model({ ...groupchat, reactions }), own).reactions).toEqual([
      {
        emoji: '🎉',
        fromJids: ['hall@rooms.example.org/romeo', 'hall@rooms.example.org/juliet'],
        mine: true,
      },
      { emoji: '👍', fromJids: ['hall@rooms.example.org/juliet'], mine: false },
    ]);
  });

  it('prefers the real JID when the room reveals it', () => {
    const known = { ...groupchat, from_real_jid: 'juliet@example.org/balcony' };
    expect(toMessage(model(known), room).fromJid).toBe('juliet@example.org');
  });

  it('never flags our own messages, nor direct ones, as mentions', () => {
    expect(toMessage(model({ ...groupchat, sender: 'me' }), room).isMention).toBe(false);
    expect(toMessage(model(groupchat), context).isMention).toBe(false);
  });
});

describe('isMention', () => {
  const body = (text: string) => model({ body: text });

  it('matches the nick as a whole word, ignoring case', () => {
    expect(isMention(body('hey Romeo!'), 'romeo')).toBe(true);
    expect(isMention(body('@romeo look'), 'romeo')).toBe(true);
    expect(isMention(body('romeo'), 'romeo')).toBe(true);
    expect(isMention(body('romeos are many'), 'romeo')).toBe(false);
    expect(isMention(body('hi'), 'romeo')).toBe(false);
    expect(isMention(body('hi'), '')).toBe(false);
  });

  it('escapes regex characters in the nick', () => {
    expect(isMention(body('ping r.o (me)'), 'r.o (me)')).toBe(true);
    expect(isMention(body('ping rxo (me)'), 'r.o (me)')).toBe(false);
  });

  it('trusts XEP-0372 mention references when the message has any', () => {
    const references = [{ type: 'mention', value: 'romeo', begin: 0, end: 5 }];
    expect(isMention(model({ body: 'x', references }), 'romeo')).toBe(true);
    const other = [{ type: 'mention', value: 'juliet', begin: 0, end: 6 }];
    expect(isMention(model({ body: 'romeo', references: other }), 'romeo')).toBe(false);
    const cased = [{ type: 'mention', value: 'Romeo', begin: 0, end: 5 }];
    expect(isMention(model({ body: 'Romeo', references: cased }), 'romeo')).toBe(true);
  });
});

describe('toChat for a room', () => {
  it('uses the kind room and the general unread counter', () => {
    const chat = toChat({
      ...model({
        jid: 'hall@rooms.example.org',
        type: 'chatroom',
        num_unread: 1,
        num_unread_general: 3,
      }),
      messages: {
        models: [],
        length: 0,
        get: () => undefined,
        on: () => undefined,
        off: () => undefined,
      },
      sendMessage: async () => undefined,
      sendFiles: async () => undefined,
      clearUnreadMsgCounter: () => undefined,
      getDisplayName: () => 'The Hall',
    });
    expect(chat).toMatchObject({
      id: 'hall@rooms.example.org',
      kind: 'room',
      title: 'The Hall',
      unreadCount: 3,
    });
  });
});
