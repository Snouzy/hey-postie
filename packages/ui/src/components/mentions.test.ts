import { describe, expect, it } from 'vitest';
import {
  completeNick,
  insertMention,
  MENTION_LIMIT,
  mentionAt,
  mentionSegments,
  rankMentions,
} from './mentions';

describe('mentionAt', () => {
  it('finds an @ at a word start, with what follows up to the caret', () => {
    expect(mentionAt('hi @', 4)).toEqual({ start: 3, query: '' });
    expect(mentionAt('hi @an', 6)).toEqual({ start: 3, query: 'an' });
    expect(mentionAt('@anna', 5)).toEqual({ start: 0, query: 'anna' });
    expect(mentionAt('mail@x', 6)).toBeNull();
    expect(mentionAt('@anna ', 6)).toBeNull();
    expect(mentionAt('@anna and', 5)).toEqual({ start: 0, query: 'anna' });
  });
});

describe('rankMentions', () => {
  const people = [
    { nick: 'Annabel', present: true },
    { nick: 'joanna', present: true },
    { nick: 'ann', present: false },
    { nick: 'Anna', present: true },
    { nick: 'bob', present: true },
  ];

  it('puts the present first, then exact, prefix, contains, then by name', () => {
    expect(rankMentions(people, 'anna').map((p) => p.nick)).toEqual(['Anna', 'Annabel', 'joanna']);
    expect(rankMentions(people, 'ann').map((p) => p.nick)).toEqual([
      'Anna',
      'Annabel',
      'joanna',
      'ann',
    ]);
  });

  it('lists everyone for an empty query, up to the limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ nick: `p${i}`, present: true }));
    expect(rankMentions(many, '')).toHaveLength(MENTION_LIMIT);
    expect(rankMentions(people, 'zed')).toEqual([]);
  });
});

describe('insertMention', () => {
  it('puts @nick and a space in place of the query, no second space', () => {
    expect(insertMention('hi @an', 3, 6, 'Anna')).toEqual({ body: 'hi @Anna ', caret: 9 });
    expect(insertMention('@an there', 0, 3, 'Anna')).toEqual({ body: '@Anna there', caret: 5 });
  });
});

describe('completeNick', () => {
  const nicks = ['bob', 'Bo', 'brenda'];

  it('completes the word into @nick, the exact nick first, with or without its @', () => {
    expect(completeNick('hello bo', 8, nicks)).toEqual({ body: 'hello @Bo ', caret: 10 });
    expect(completeNick('hi @bre', 7, nicks)).toEqual({ body: 'hi @brenda ', caret: 11 });
    expect(completeNick('hi zed', 6, nicks)).toBeNull();
    expect(completeNick('hi @', 4, nicks)).toBeNull();
  });
});

describe('mentionSegments', () => {
  it('cuts the body around the mentions, keeping their text', () => {
    const mention = { begin: 3, end: 7, nick: 'anna' };
    expect(mentionSegments('hi anna, ok', [mention])).toEqual([
      { text: 'hi ' },
      { text: 'anna', mention },
      { text: ', ok' },
    ]);
    expect(mentionSegments('plain')).toEqual([{ text: 'plain' }]);
  });
});
