import { describe, expect, it } from 'vitest';
import { message } from '../test-utils';
import { replyAuthor, replyExcerpt } from './replies';

describe('replyAuthor', () => {
  it('says “You” for mine, the nick in a hall, else the peer’s name', () => {
    expect(replyAuthor({ mine: true, fromNick: 'alice' }, 'Bob', 'You')).toBe('You');
    expect(replyAuthor({ fromNick: 'anna' }, 'Hall', 'You')).toBe('anna');
    expect(replyAuthor({ fromJid: 'hall@rooms.x.org/olga' }, 'Hall', 'You')).toBe('olga');
    expect(replyAuthor({ fromJid: 'bob@x.org' }, 'Bob', 'You')).toBe('Bob');
    expect(replyAuthor({}, 'Bob', 'You')).toBe('Bob');
  });
});

describe('replyExcerpt', () => {
  it('is the text on one line, else the parcel’s name, nothing for what cannot be read', () => {
    expect(replyExcerpt(message({ body: 'one\ntwo' }))).toBe('one two');
    const parcel = {
      url: 'https://x.org/a.png',
      name: 'a.png',
      size: 1,
      mimeType: 'image/png',
      encryption: 'none' as const,
    };
    expect(replyExcerpt(message({ body: '', attachments: [parcel] }))).toBe('a.png');
    expect(replyExcerpt(message({ encryption: 'undecryptable' }))).toBe('');
  });
});
