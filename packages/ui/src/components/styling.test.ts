import { describe, expect, it } from 'vitest';
import { type Block, hasBlocks, hasStyling, parseStyling, type Span } from './styling';

/** The parse written out: spans as `kind(…)`, plain text quoted, blocks separated by ` | `. */
function show(body: string): string {
  const span = (item: Span): string =>
    item.kind === 'text'
      ? JSON.stringify(body.slice(item.start, item.end))
      : `${item.kind}(${item.children.map(span).join(' ')})`;
  const block = (item: Block): string => {
    if (item.kind === 'line') return item.spans.map(span).join(' ');
    if (item.kind === 'quote') return `quote{${item.children.map(block).join(' | ')}}`;
    const lines = item.lines.map((line) => body.slice(line.start, line.end)).join('\n');
    const fence = body.slice(item.fence.start, item.fence.end);
    return `pre[${fence}]{${lines}}${item.closing ? '' : '…'}`;
  };
  return parseStyling(body).map(block).join(' | ');
}

describe('XEP-0393 spans (§6.2)', () => {
  it('styles the spec’s examples as it says', () => {
    expect(show('plain span')).toBe('"plain span"');
    expect(show('*strong span*')).toBe('strong("strong span")');
    expect(show('plain _emphasis_ plain')).toBe('"plain " emphasis("emphasis") " plain"');
    expect(show('`pre` plain *strong*')).toBe('code("pre") " plain " strong("strong")');
    expect(show('*strong*plain*')).toBe('strong("strong") "plain*"');
    expect(show('* plain *strong*')).toBe('"* plain " strong("strong")');
  });

  it('styles nothing in the spec’s counter-examples', () => {
    for (const body of ['not strong*', '*not strong', '*not *strong', '**', '***', '****']) {
      expect(show(body), body).toBe(JSON.stringify(body));
    }
    // A span never crosses a line.
    expect(show('*not \n strong*')).toBe('"*not " | " strong*"');
  });

  it('keeps a preformatted span plain inside (§6.2.5)', () => {
    expect(show('This is `monospace`')).toBe('"This is " code("monospace")');
    expect(show('This is `*monospace*`')).toBe('"This is " code("*monospace*")');
    expect(show('This is *`monospace and bold`*')).toBe(
      '"This is " strong(code("monospace and bold"))',
    );
    expect(show('Wow, I can write in `monospace`!')).toBe(
      '"Wow, I can write in " code("monospace") "!"',
    );
  });

  it('reads examples 7, 8 and 10: plain, emphasis on two lines, strike inside a word', () => {
    expect(show('Two spans, both *alike in dignity*')).toBe(
      '"Two spans, both " strong("alike in dignity")',
    );
    expect(
      show('The full title is _Twelfth Night, or What You Will_ but\n_most_ people shorten it.'),
    ).toBe(
      '"The full title is " emphasis("Twelfth Night, or What You Will") " but" | emphasis("most") " people shorten it."',
    );
    expect(show('Everyone ~dis~likes cake.')).toBe('"Everyone " strike("dis") "likes cake."');
  });

  it('nests different directives, the inner one right after the outer', () => {
    expect(show('_*both*_')).toBe('emphasis(strong("both"))');
    expect(show('*bold _and italic_*')).toBe('strong("bold " emphasis("and italic"))');
  });

  it('leaves words, paths and addresses with directives inside them alone', () => {
    for (const body of [
      'snake_case_name',
      'https://x.org/a_b_c and ~/notes',
      'a * b * c',
      '2*3*4',
      'files *.txt and *.md',
    ]) {
      expect(show(body), body).toBe(JSON.stringify(body));
    }
  });

  it('closes lazily, on the first directive that is not after a space', () => {
    expect(show('*a *b* c*')).toBe('strong("a *b") " c*"');
    expect(show('*a**')).toBe('strong("a") "*"');
  });

  it('counts in UTF-16 units, as mentions do', () => {
    const body = '😀 *ok*';
    const [line] = parseStyling(body);
    expect(line?.kind === 'line' && line.spans[1]).toMatchObject({
      kind: 'strong',
      open: 3,
      close: 6,
    });
  });
});

describe('XEP-0393 blocks (§6.1)', () => {
  it('makes each line a plain block (example 2)', () => {
    expect(
      show(
        'There are three blocks in this body, one per line,\nbut there is no *formatting\nas spans* may not escape blocks.',
      ),
    ).toBe(
      '"There are three blocks in this body, one per line," | "but there is no *formatting" | "as spans* may not escape blocks."',
    );
  });

  it('keeps a preformatted block as it is, its fences apart (example 3)', () => {
    expect(
      show(
        '```ignored\n(println "Hello, world!")\n```\n\nThis should show up as monospace, preformatted text ⤴',
      ),
    ).toBe(
      'pre[```ignored]{(println "Hello, world!")} |  | "This should show up as monospace, preformatted text ⤴"',
    );
    expect(show('```\n*not strong*\n> not a quote\n```')).toBe(
      'pre[```]{*not strong*\n> not a quote}',
    );
  });

  it('ends a preformatted block with its parent quote (example 4)', () => {
    expect(
      show(
        '> ```\n> (println "Hello, world!")\n\nThe entire blockquote is a preformatted text block, but this line\nis plaintext!',
      ),
    ).toBe(
      'quote{pre[```]{(println "Hello, world!")}…} |  | "The entire blockquote is a preformatted text block, but this line" | "is plaintext!"',
    );
    expect(show('```\nno end')).toBe('pre[```]{no end}…');
  });

  it('reads quotes and nested quotes (examples 5 and 6)', () => {
    expect(show('> That that is, is.\n\nSaid the old hermit of Prague.')).toBe(
      'quote{"That that is, is."} |  | "Said the old hermit of Prague."',
    );
    expect(show('>> That that is, is.\n> Said the old hermit of Prague.\n\nWho?')).toBe(
      'quote{quote{"That that is, is."} | "Said the old hermit of Prague."} |  | "Who?"',
    );
  });

  it('trims only the first space after `>`, and styles the quoted text', () => {
    expect(show('>  two spaces')).toBe('quote{" two spaces"}');
    expect(show('>\tTabbed *in*')).toBe('quote{"Tabbed " strong("in")}');
    expect(show('>no space')).toBe('quote{"no space"}');
    expect(show('a > b')).toBe('"a > b"');
  });

  it('reads `> _ <` as a quote: what <unstyled/> is for (example 12)', () => {
    expect(show('> _ <')).toBe('quote{"_ <"}');
  });
});

describe('hasStyling and hasBlocks', () => {
  it('tell a plain body from a styled one, and spans from blocks', () => {
    expect(hasStyling(parseStyling('just text\non two lines'))).toBe(false);
    expect(hasStyling(parseStyling('a *b*'))).toBe(true);
    expect(hasBlocks(parseStyling('a *b*'))).toBe(false);
    expect(hasBlocks(parseStyling('> quoted'))).toBe(true);
    expect(hasBlocks(parseStyling('```\ncode\n```'))).toBe(true);
  });
});
