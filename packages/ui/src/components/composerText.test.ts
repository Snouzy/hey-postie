import { describe, expect, it } from 'vitest';
import { formatMarker, wrapSelection } from './composerText';

const key = (k: string, extra: Partial<Parameters<typeof formatMarker>[0]> = {}) => ({
  key: k,
  metaKey: true,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});

describe('formatMarker', () => {
  it('maps ⌘B, ⌘I and ⌘E (or Ctrl) to the XEP-0393 directives', () => {
    expect(formatMarker(key('b'))).toBe('*');
    expect(formatMarker(key('i'))).toBe('_');
    expect(formatMarker(key('e'))).toBe('`');
    expect(formatMarker(key('B', { metaKey: false, ctrlKey: true }))).toBe('*');
  });

  it('leaves other keys and other modifiers alone', () => {
    expect(formatMarker(key('b', { metaKey: false }))).toBeNull();
    expect(formatMarker(key('b', { shiftKey: true }))).toBeNull();
    expect(formatMarker(key('i', { altKey: true }))).toBeNull();
    expect(formatMarker(key('k'))).toBeNull();
  });
});

describe('wrapSelection', () => {
  it('wraps the selection and selects it again, directives included', () => {
    expect(wrapSelection('say hello now', 4, 9, '*')).toEqual({
      body: 'say *hello* now',
      start: 4,
      end: 11,
    });
  });

  it('puts the pair with the caret inside when nothing is selected', () => {
    expect(wrapSelection('ab', 1, 1, '_')).toEqual({ body: 'a__b', start: 2, end: 2 });
  });

  it('keeps the outer spaces outside, so the directives touch the text', () => {
    expect(wrapSelection('a bold b', 1, 7, '*').body).toBe('a *bold* b');
  });

  it('wraps each line on its own, skipping empty ones: a span never crosses a line', () => {
    expect(wrapSelection('one\n\ntwo', 0, 8, '~').body).toBe('~one~\n\n~two~');
  });

  it('turns code over several lines into a ``` block on lines of its own', () => {
    expect(wrapSelection('see a\nb end', 4, 7, '`').body).toBe('see \n```\na\nb\n```\n end');
    expect(wrapSelection('a\nb', 0, 3, '`').body).toBe('```\na\nb\n```');
  });
});
