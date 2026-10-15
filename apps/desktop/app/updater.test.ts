import { describe, expect, it } from 'vitest';
import { isCheckDue, MIN_CHECK_INTERVAL_MS } from './updater';

const NOW = 1_800_000_000_000;

describe('isCheckDue', () => {
  it('checks on the first start, when nothing is recorded', () => {
    expect(isCheckDue(undefined, NOW)).toBe(true);
  });

  it('waits when the last check is more recent than the interval', () => {
    expect(isCheckDue(NOW - 1, NOW)).toBe(false);
    expect(isCheckDue(NOW - MIN_CHECK_INTERVAL_MS + 1, NOW)).toBe(false);
  });

  it('checks again once the interval has passed', () => {
    expect(isCheckDue(NOW - MIN_CHECK_INTERVAL_MS, NOW)).toBe(true);
    expect(isCheckDue(NOW - 7 * 24 * MIN_CHECK_INTERVAL_MS, NOW)).toBe(true);
  });

  it('checks when the recorded time is in the future or unusable', () => {
    expect(isCheckDue(NOW + MIN_CHECK_INTERVAL_MS, NOW)).toBe(true);
    expect(isCheckDue(Number.NaN, NOW)).toBe(true);
  });
});
