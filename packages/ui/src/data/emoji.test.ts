import { describe, expect, it } from 'vitest';
import { favouriteEmojis, suggestEmojis } from './emoji';

describe('favouriteEmojis', () => {
  it('falls back to 👍 ❤️ 😂', () => {
    expect(favouriteEmojis({}).map((entry) => entry.shortname)).toEqual([
      'thumbsup',
      'heart',
      'joy',
    ]);
  });

  it('puts the most used first, fills up with the defaults, skips what it does not know', () => {
    const usage = { '🎉': 2, '😂': 5, 'not an emoji': 9 };
    expect(favouriteEmojis(usage).map((entry) => entry.emoji)).toEqual(['😂', '🎉', '👍']);
  });
});

describe('suggestEmojis', () => {
  it('lists the shortnames that start with the query first, shortest first, at most eight', () => {
    const found = suggestEmojis('smi');
    expect(found.slice(0, 2).map((entry) => entry.shortname)).toEqual(['smile', 'smirk']);
    expect(found.length).toBeLessThanOrEqual(8);
    expect(suggestEmojis('SMILE')[0]?.shortname).toBe('smile');
  });

  it('finds nothing for a query no emoji has', () => {
    expect(suggestEmojis('zzqx')).toEqual([]);
  });
});
