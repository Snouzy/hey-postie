import { describe, expect, it } from 'vitest';
import type { Message } from '../contracts/types';
import {
  EXCERPT_MAX_LENGTH,
  MAX_LINK_PREVIEWS,
  sanitize,
  sanitizeReactions,
  validMentions,
} from './sanitize';

const letter = (extra: Partial<Message> = {}): Message => ({
  id: 'm1',
  chatId: 'hall@rooms.x.org',
  fromJid: 'hall@rooms.x.org/anna',
  body: 'hi olga',
  sentAt: new Date(2026, 9, 17),
  direction: 'in',
  status: 'delivered',
  encryption: 'none',
  attachments: [],
  reactions: [],
  isMention: false,
  ...extra,
});

describe('sanitize', () => {
  it('returns the same message when nothing changes', () => {
    const clean = letter({
      replyTo: { id: 'o1', excerpt: 'fine' },
      mentions: [{ begin: 3, end: 7, nick: 'olga' }],
    });
    expect(sanitize(clean)).toBe(clean);
  });

  it('makes a reply excerpt one bounded line without control characters', () => {
    const long = `line one\n\u0007line two ${'x'.repeat(200)}`;
    const replyTo = sanitize(
      letter({ replyTo: { id: 'o1', excerpt: long, fromNick: 'a\u0007b' } }),
    ).replyTo;
    expect(replyTo?.excerpt?.startsWith('line one line two')).toBe(true);
    expect(replyTo?.excerpt).toHaveLength(EXCERPT_MAX_LENGTH);
    expect(replyTo?.excerpt?.endsWith('…')).toBe(true);
    expect(replyTo?.fromNick).toBe('ab');
  });

  it('drops the mentions of a body that lost characters: their offsets no longer hold', () => {
    const dirty = letter({ body: 'hi\u0007 olga', mentions: [{ begin: 4, end: 8, nick: 'olga' }] });
    expect(sanitize(dirty).mentions).toBeUndefined();
  });
});

describe('validMentions', () => {
  it('keeps ranges that hold the nick, with or without @, in order and apart', () => {
    const body = '@olga and anna';
    const ok = [
      { begin: 0, end: 5, nick: 'olga' },
      { begin: 10, end: 14, nick: 'Anna' },
    ];
    expect(validMentions(body, ok)).toBe(ok);
    expect(
      validMentions(body, [
        { begin: 0, end: 5, nick: 'olga' },
        { begin: 2, end: 6, nick: 'lga ' },
        { begin: 10, end: 99, nick: 'anna' },
        { begin: 6, end: 9, nick: 'xyz' },
      ]),
    ).toEqual([{ begin: 0, end: 5, nick: 'olga' }]);
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

describe('link previews', () => {
  const page = { url: 'https://x.org/a', title: 'A', description: 'About a', siteName: 'X' };

  it('keeps a clean preview as it is', () => {
    expect(sanitize(letter({ linkPreviews: [page] })).linkPreviews).toEqual([page]);
  });

  it('makes each text one bounded line without control characters, and drops empty ones', () => {
    const [clean] =
      sanitize(
        letter({
          linkPreviews: [
            {
              url: 'https://x.org/a',
              title: 'Big\n\u0007news',
              description: 'd'.repeat(400),
              siteName: '   ',
              imageUrl: 'https://x.org/a.png',
            },
          ],
        }),
      ).linkPreviews ?? [];
    expect(clean?.title).toBe('Big news');
    expect(clean?.description).toHaveLength(300);
    expect(clean?.description?.endsWith('…')).toBe(true);
    expect(clean?.siteName).toBeUndefined();
    expect(clean?.imageUrl).toBe('https://x.org/a.png');
  });

  it('shows a few previews at most', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...page, url: `https://x.org/${i}` }));
    expect(sanitize(letter({ linkPreviews: many })).linkPreviews).toHaveLength(MAX_LINK_PREVIEWS);
  });
});
