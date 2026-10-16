import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('lets the last of two clashing utilities win', () => {
    expect(cn('p-2 text-ink', 'p-4')).toBe('text-ink p-4');
  });

  it('keeps the line height when a text size is added', () => {
    expect(cn('leading-[1.3] font-semibold', 'text-[13px]')).toBe(
      'leading-[1.3] font-semibold text-[13px]',
    );
  });

  it('tells a token colour from a text size', () => {
    expect(cn('text-ink', 'text-[13px]', 'text-red')).toBe('text-[13px] text-red');
  });
});
