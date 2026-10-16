import { describe, expect, it } from 'vitest';
import { dayLabel } from './dates';
import { t } from './index';

// A Friday.
const NOW = new Date(2026, 9, 16, 15, 0);
const daysAgo = (days: number) => new Date(2026, 9, 16 - days, 9, 0);

describe('dayLabel', () => {
  const en = (date: Date) => dayLabel('en', date, (key) => t('en', key), NOW);
  const fr = (date: Date) => dayLabel('fr', date, (key) => t('fr', key), NOW);

  it('says Today, Yesterday, then the weekday within the week, then the date', () => {
    expect(en(daysAgo(0))).toBe('Today');
    expect(en(daysAgo(1))).toBe('Yesterday');
    expect(en(daysAgo(2))).toBe('Wednesday');
    expect(en(daysAgo(6))).toBe('Saturday');
    expect(en(daysAgo(7))).toBe('October 9, 2026');
  });

  it('writes the weekday in the locale, with a capital', () => {
    expect(fr(daysAgo(1))).toBe('Hier');
    expect(fr(daysAgo(4))).toBe('Lundi');
    expect(fr(daysAgo(8))).toBe('8 octobre 2026');
  });

  it('dates a day ahead of our clock, never a weekday', () => {
    expect(en(new Date(2026, 9, 18, 9, 0))).toBe('October 18, 2026');
  });
});
