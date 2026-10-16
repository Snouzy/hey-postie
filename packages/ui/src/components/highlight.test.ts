import { describe, expect, it } from 'vitest';
import { highlight } from './highlight';

describe('highlight', () => {
  it('cuts the body into plain and matched segments', () => {
    expect(
      highlight('Lunch at noon, lunch?', [
        { start: 0, end: 5 },
        { start: 15, end: 20 },
      ]),
    ).toEqual([
      { text: 'Lunch', match: true },
      { text: ' at noon, ', match: false },
      { text: 'lunch', match: true },
      { text: '?', match: false },
    ]);
  });

  it('starts a little before a match far into the body', () => {
    const body = `${'a'.repeat(100)}needle end`;
    const segments = highlight(body, [{ start: 100, end: 106 }]);
    expect(segments[0]).toEqual({ text: '…', match: false });
    expect(segments[1]?.text).toHaveLength(32);
    expect(segments[2]).toEqual({ text: 'needle', match: true });
  });

  it('shows the start of the body when nothing in it matched (a file name did)', () => {
    expect(highlight('see attached', [])).toEqual([{ text: 'see attached', match: false }]);
  });
});
