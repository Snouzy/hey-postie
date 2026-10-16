import { describe, expect, it } from 'vitest';
import { toChat, toMessage } from './mappers';
import type { ChatModel, MessageModel } from './models';
import { excerptFromQuote, mentionsOf, REPLY_NS, replyAttributes } from './replies';

function model(attrs: Record<string, unknown>): MessageModel {
  return {
    get: (key) => attrs[key],
    save: () => undefined,
    set: () => undefined,
    on: () => undefined,
    off: () => undefined,
  };
}

const context = { chatId: 'juliet@example.org', authenticated: true, unread: 0 };
const room = { ...context, chatId: 'hall@rooms.example.org', ownNick: 'romeo' };
const QUOTE = '> Juliet:\n> Wherefore art thou?\n';

/** A reply as Converse stores it: the quote in the body, its range in code points. */
function reply(extra: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    from: 'juliet@example.org/balcony',
    sender: 'them',
    time: '2026-10-17T10:00:00.000Z',
    body: `${QUOTE}Here I am`,
    reply_to_id: 'orig-1',
    reply_to: 'romeo@example.org/desk',
    fallback: { [REPLY_NS]: { start: 0, end: [...QUOTE].length } },
    ...extra,
  };
}

describe('replies, mapped', () => {
  it('strips the quoted fallback and keeps what the reply says when the original is not loaded', () => {
    const message = toMessage(model(reply()), context);
    expect(message.body).toBe('Here I am');
    expect(message.replyTo).toEqual({
      id: 'orig-1',
      fromJid: 'romeo@example.org',
      mine: true,
      excerpt: 'Wherefore art thou?',
    });
  });

  it('names the loaded original by our id, with its text', () => {
    const original = model({
      id: 'local-7',
      from: 'romeo@example.org/desk',
      sender: 'me',
      time: '2026-10-17T09:00:00.000Z',
      body: 'Wherefore art thou?',
    });
    const message = toMessage(model(reply()), {
      ...context,
      replied: (id) => (id === 'orig-1' ? original : undefined),
    });
    expect(message.replyTo).toEqual({
      id: 'local-7',
      fromJid: 'romeo@example.org',
      mine: true,
      excerpt: 'Wherefore art thou?',
    });
  });

  it('strips by code points, so an emoji in the quote does not cut the reply', () => {
    const quote = '> 🌹\n'; // 4 code points, 5 UTF-16 units
    const message = toMessage(
      model(reply({ body: `${quote}yes`, fallback: { [REPLY_NS]: { start: 0, end: 4 } } })),
      context,
    );
    expect(message.body).toBe('yes');
  });

  it('leaves the body whole when the range does not fit or the letter is no reply', () => {
    const odd = reply({ fallback: { [REPLY_NS]: { start: 0, end: 999 } } });
    expect(toMessage(model(odd), context).body).toBe(`${QUOTE}Here I am`);
    const plain = reply({ reply_to_id: undefined });
    expect(toMessage(model(plain), context).body).toBe(`${QUOTE}Here I am`);
    expect(toMessage(model(plain), context).replyTo).toBeUndefined();
  });

  it('in a hall, the author is the occupant and mine when the nick is ours', () => {
    const message = toMessage(
      model(
        reply({ from: 'hall@rooms.example.org/juliet', reply_to: 'hall@rooms.example.org/romeo' }),
      ),
      room,
    );
    expect(message.replyTo).toMatchObject({
      fromJid: 'hall@rooms.example.org/romeo',
      fromNick: 'romeo',
      mine: true,
    });
  });

  it('carries no reply on a deleted letter', () => {
    expect(toMessage(model(reply({ retracted: true })), context).replyTo).toBeUndefined();
  });
});

describe('mentions, mapped', () => {
  it('maps the references of a hall letter, moved back by the stripped quote', () => {
    const body = `${QUOTE}tybalt, look`;
    const shift = QUOTE.length;
    const message = toMessage(
      model(
        reply({
          from: 'hall@rooms.example.org/juliet',
          body,
          references: [{ begin: shift, end: shift + 6, type: 'mention', value: 'tybalt' }],
        }),
      ),
      room,
    );
    expect(message.body).toBe('tybalt, look');
    expect(message.mentions).toEqual([{ begin: 0, end: 6, nick: 'tybalt' }]);
  });

  it('has none in a direct chat', () => {
    const references = [{ begin: 0, end: 6, type: 'mention', value: 'tybalt' }];
    expect(toMessage(model(reply({ references })), context).mentions).toBeUndefined();
  });
});

describe('mentionsOf', () => {
  it('drops other types and those inside the quote, strips the @ of the value, sorts', () => {
    const references = [
      { begin: 20, end: 25, type: 'mention', value: '@anna' },
      { begin: 2, end: 6, type: 'mention', value: 'olga' },
      { begin: 8, end: 12, type: 'data', value: 'x' },
    ];
    expect(mentionsOf(references, { begin: 0, end: 10 })).toEqual([
      { begin: 10, end: 15, nick: 'anna' },
    ]);
    expect(mentionsOf(references, null).map((m) => m.nick)).toEqual(['olga', 'anna']);
    expect(mentionsOf('nope', null)).toEqual([]);
  });
});

describe('excerptFromQuote', () => {
  it('drops the author line Converse puts first and joins the rest', () => {
    expect(excerptFromQuote('> Juliet:\n> one\n> two\n')).toBe('one two');
    expect(excerptFromQuote('> just this\n')).toBe('just this');
    expect(excerptFromQuote('')).toBe('');
  });
});

describe('replyAttributes', () => {
  const chat = (jid: string) => model({ jid }) as unknown as ChatModel;

  it('names a direct letter by its id and its sender', () => {
    const original = model({ msgid: 'abc', from: 'juliet@example.org/balcony' });
    expect(replyAttributes(chat('juliet@example.org'), original, false)).toEqual({
      reply_to_id: 'abc',
      reply_to: 'juliet@example.org/balcony',
    });
  });

  it('names a hall letter by the room’s stanza id, and refuses one without', () => {
    const jid = 'hall@rooms.example.org';
    const stamped = model({ msgid: 'abc', [`stanza_id ${jid}`]: 'S1', from: `${jid}/juliet` });
    expect(replyAttributes(chat(jid), stamped, true)).toEqual({
      reply_to_id: 'S1',
      reply_to: `${jid}/juliet`,
    });
    expect(replyAttributes(chat(jid), model({ msgid: 'abc' }), true)).toBeNull();
  });
});

describe('toChat, first unread', () => {
  const chat = (attrs: Record<string, unknown>) =>
    ({ ...model(attrs), getDisplayName: () => null }) as unknown as ChatModel;

  it('gives the first unread id only while there are unread letters', () => {
    const jid = 'juliet@example.org';
    expect(toChat(chat({ jid, num_unread: 2, first_unread_id: 'm5' })).firstUnreadId).toBe('m5');
    expect(
      toChat(chat({ jid, num_unread: 0, first_unread_id: 'm5' })).firstUnreadId,
    ).toBeUndefined();
    const hall = { jid: 'hall@rooms.example.org', type: 'chatroom', num_unread_general: 1 };
    expect(toChat(chat({ ...hall, first_unread_id: 'h1' })).firstUnreadId).toBe('h1');
  });
});
