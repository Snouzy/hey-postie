/**
 * XEP-0393 Message Styling (spec 2026-10-17, Lot B item 11): a letter's body cut into blocks
 * (lines, quotes, preformatted blocks) and each line into spans (strong, emphasis, strike,
 * preformatted). Pure: offsets point into the body, so mentions (also offsets) and links still
 * find their text; the components draw the result as React elements, never as HTML.
 * Rules: https://xmpp.org/extensions/xep-0393.html §6 (version 1.1.1, read 2026-10-17).
 */

/** A stretch of the body, `end` excluded. */
export interface Range {
  start: number;
  end: number;
}

export type SpanKind = 'strong' | 'emphasis' | 'strike' | 'code';

export type Span =
  | ({ kind: 'text' } & Range)
  /** `open` and `close` are the indexes of the two directives; the content lies between them. */
  | { kind: SpanKind; open: number; close: number; children: Span[] };

export type Block =
  /** One line of text outside a preformatted block (an empty line has no spans). */
  | { kind: 'line'; spans: Span[] }
  /**
   * A preformatted block: its opening line (```, then a hint the spec ignores), the lines inside,
   * and the closing ``` line unless the parent block ended first.
   */
  | { kind: 'pre'; fence: Range; lines: Range[]; closing?: Range }
  | { kind: 'quote'; children: Block[] };

const DIRECTIVES: Record<string, SpanKind> = {
  '*': 'strong',
  _: 'emphasis',
  '~': 'strike',
  '`': 'code',
};
const FENCE = '```';

/** The body as blocks. A body with no styling at all is one `line` block per line. */
export function parseStyling(body: string): Block[] {
  const lines: Range[] = [];
  let start = 0;
  for (const line of body.split('\n')) {
    lines.push({ start, end: start + line.length });
    start += line.length + 1;
  }
  return parseBlocks(body, lines);
}

/** §6.1: blocks first, quotes parsed again inside, spans inside each plain line. */
function parseBlocks(body: string, lines: Range[]): Block[] {
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] as Range;
    const text = body.slice(line.start, line.end);
    if (text.startsWith(FENCE)) {
      // Ends at a line that is only the fence, or at the end of the parent block.
      let last = index + 1;
      while (last < lines.length && slice(body, lines[last] as Range) !== FENCE) last += 1;
      const inside = lines.slice(index + 1, last);
      const end = lines[last];
      blocks.push(
        end
          ? { kind: 'pre', fence: line, lines: inside, closing: end }
          : { kind: 'pre', fence: line, lines: inside },
      );
      index = last + 1;
    } else if (text.startsWith('>')) {
      const quoted: Range[] = [];
      while (index < lines.length && body[(lines[index] as Range).start] === '>') {
        quoted.push(unquoted(body, lines[index] as Range));
        index += 1;
      }
      blocks.push({ kind: 'quote', children: parseBlocks(body, quoted) });
    } else {
      blocks.push({ kind: 'line', spans: parseSpans(body, line.start, line.end) });
      index += 1;
    }
  }
  return blocks;
}

/** A quoted line without its `>` and the first whitespace character after it (§6.1.3). */
function unquoted(body: string, line: Range): Range {
  const start = line.start + 1;
  return { start: start < line.end && isSpace(body[start]) ? start + 1 : start, end: line.end };
}

/**
 * §6.2, lazily from the start: an opening directive at the start of the block, after a space or
 * after another opening directive, followed by neither a space nor itself; the first matching
 * directive after some text, not preceded by a space, closes it. Anything else is plain text.
 */
export function parseSpans(body: string, start: number, end: number): Span[] {
  const spans: Span[] = [];
  let plainFrom = start;
  let index = start;
  while (index < end) {
    const kind = DIRECTIVES[body[index] ?? ''];
    const close = kind ? closeOf(body, index, start, end) : -1;
    if (!kind || close < 0) {
      index += 1;
      continue;
    }
    if (plainFrom < index) spans.push({ kind: 'text', start: plainFrom, end: index });
    const inner = { kind: 'text' as const, start: index + 1, end: close };
    // A preformatted span holds plain text only.
    const children = kind === 'code' ? [inner] : parseSpans(body, index + 1, close);
    spans.push({ kind, open: index, close, children });
    index = close + 1;
    plainFrom = index;
  }
  if (plainFrom < end) spans.push({ kind: 'text', start: plainFrom, end });
  return spans;
}

/** Where the span opened at `open` closes, or -1 when that directive opens nothing. */
function closeOf(body: string, open: number, blockStart: number, end: number): number {
  const directive = body[open];
  const before = body[open - 1];
  const after = body[open + 1];
  // A directive just after the block's start is "after another opening directive" in a span.
  const placed = open === blockStart || isSpace(before);
  if (!placed || after === undefined || open + 1 >= end || isSpace(after) || after === directive) {
    return -1;
  }
  for (let index = open + 2; index < end; index += 1) {
    if (body[index] === directive && !isSpace(body[index - 1])) return index;
  }
  return -1;
}

function isSpace(char: string | undefined): boolean {
  return char !== undefined && /\s/u.test(char);
}

function slice(body: string, range: Range): string {
  return body.slice(range.start, range.end);
}

/** True when the body would show anything else than its plain lines. */
export function hasStyling(blocks: Block[]): boolean {
  return blocks.some(
    (block) => block.kind !== 'line' || block.spans.some((span) => span.kind !== 'text'),
  );
}

/** True when a block needs its own box (a quote or a preformatted block). */
export function hasBlocks(blocks: Block[]): boolean {
  return blocks.some((block) => block.kind !== 'line');
}
