/** A stretch of a snippet: plain text, or a match to highlight. */
export interface Segment {
  text: string;
  match: boolean;
}

/** Characters kept before the first match, so the reader sees what leads to it. */
const BEFORE = 32;
/** The longest snippet; the line truncates it further on a narrow column. */
const LENGTH = 160;

/**
 * The part of `body` around its first match, cut into plain and matched segments by `ranges`
 * (offsets into `body`, from the search). Text only: the caller renders each segment as a text
 * node, so nothing in a body is ever read as markup.
 */
export function highlight(body: string, ranges: { start: number; end: number }[]): Segment[] {
  const first = ranges[0];
  const from = first ? Math.max(0, first.start - BEFORE) : 0;
  const to = Math.min(body.length, from + LENGTH);
  const segments: Segment[] = [];
  let cursor = from;
  for (const range of ranges) {
    const start = Math.max(range.start, cursor);
    const end = Math.min(range.end, to);
    if (start >= end) continue;
    if (start > cursor) segments.push({ text: body.slice(cursor, start), match: false });
    segments.push({ text: body.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < to) segments.push({ text: body.slice(cursor, to), match: false });
  if (from > 0) segments.unshift({ text: '…', match: false });
  return segments;
}
