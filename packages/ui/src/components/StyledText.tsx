import type { ReactNode } from 'react';
import type { Block, Range, Span, SpanKind } from './styling';

// The directives stay visible, as XEP-0393 §8 recommends, a step quieter than the text they style.
const DIRECTIVE = 'opacity-50';
// Code and quotes take the ink of their bubble (navy-contrast on mine, ink on paper).
const CODE = 'rounded-sm bg-current/10 px-1 font-mono text-[0.9em]';
const PRE =
  'm-0 my-1 rounded-sm bg-current/10 px-2 py-1 font-mono text-[13px] leading-[1.45] whitespace-pre-wrap wrap-anywhere';
const QUOTE = 'm-0 my-1 border-l-3 border-current/40 pl-2 opacity-90';

const SPAN_TAGS: Record<SpanKind, { tag: 'strong' | 'em' | 's' | 'code'; className?: string }> = {
  strong: { tag: 'strong', className: 'font-bold' },
  emphasis: { tag: 'em' },
  strike: { tag: 's' },
  code: { tag: 'code', className: CODE },
};

interface StyledBlocksProps {
  body: string;
  blocks: Block[];
  /** Draws a stretch of plain text (links, mention chips). */
  plain: (range: Range) => ReactNode;
}

/**
 * Message Styling drawn as React elements (`styling.ts` parses). Lines follow one another with
 * a line break (the body is `whitespace-pre-wrap`); quotes and preformatted blocks are boxes.
 */
export function StyledBlocks({ body, blocks, plain }: StyledBlocksProps) {
  return blocks.map((block, index) => {
    const next = blocks[index + 1];
    const key = `b${index}`;
    if (block.kind === 'quote') {
      return (
        <blockquote key={key} className={QUOTE}>
          <StyledBlocks body={body} blocks={block.children} plain={plain} />
        </blockquote>
      );
    }
    if (block.kind === 'pre') {
      const inside = block.lines.map((line) => body.slice(line.start, line.end)).join('\n');
      return (
        <pre key={key} className={PRE}>
          <span className={DIRECTIVE}>{body.slice(block.fence.start, block.fence.end)}</span>
          {block.lines.length > 0 && `\n${inside}`}
          {block.closing && <span className={DIRECTIVE}>{'\n```'}</span>}
        </pre>
      );
    }
    return (
      <span key={key}>
        {block.spans.map((span) => (
          <StyledSpan key={spanKey(span)} body={body} span={span} plain={plain} />
        ))}
        {next?.kind === 'line' && '\n'}
      </span>
    );
  });
}

function StyledSpan({
  body,
  span,
  plain,
}: {
  body: string;
  span: Span;
  plain: StyledBlocksProps['plain'];
}) {
  if (span.kind === 'text') return plain(span);
  const { tag: Tag, className } = SPAN_TAGS[span.kind];
  return (
    <Tag className={className}>
      <span className={DIRECTIVE}>{body[span.open]}</span>
      {span.kind === 'code'
        ? body.slice(span.open + 1, span.close)
        : span.children.map((child) => (
            <StyledSpan key={spanKey(child)} body={body} span={child} plain={plain} />
          ))}
      <span className={DIRECTIVE}>{body[span.close]}</span>
    </Tag>
  );
}

function spanKey(span: Span): string {
  return span.kind === 'text' ? `t${span.start}` : `s${span.open}`;
}
