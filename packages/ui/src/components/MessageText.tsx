import type { Mention } from '@hey-postie/core';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Linkify } from './Linkify';
import { StyledBlocks } from './StyledText';
import { hasBlocks, hasStyling, parseStyling, type Range } from './styling';

// A member named in a letter: a soft navy chip on paper, a lighter one on a navy bubble.
const CHIP = 'rounded-sm px-[3px] font-semibold';
const CHIP_IN = 'bg-[color-mix(in_srgb,var(--navy)_14%,transparent)] text-navy';
const CHIP_OUT = 'bg-[color-mix(in_srgb,var(--navy-contrast)_22%,transparent)]';
// Me: the stamp yellow of the "mentions you" highlight.
const CHIP_ME = 'bg-yellow text-on-yellow';

interface MessageTextProps {
  body: string;
  /** XEP-0372 mentions in `body` (halls). */
  mentions?: Mention[] | undefined;
  /** My nick in the hall: the chip naming me stands out. */
  ownNick?: string | undefined;
  /** On a navy bubble (mine). */
  outgoing: boolean;
  /** XEP-0393 `<unstyled/>`: the sender asked for plain text. */
  unstyled?: boolean | undefined;
  onOpenLink: (url: string) => void;
  /** The paragraph's own classes (the bubble's or the line's). */
  className?: string;
}

/**
 * A letter's text: XEP-0393 styling (`styling.ts`), links clickable, mentions as `@nick` chips.
 * A `<p>`, or a `<div>` when a quote or a preformatted block needs a box of its own. Never HTML.
 */
export function MessageText({
  body,
  mentions = [],
  ownNick,
  outgoing,
  unstyled = false,
  onOpenLink,
  className,
}: MessageTextProps) {
  const blocks = unstyled ? [] : parseStyling(body);
  const styled = hasStyling(blocks);
  const Tag = styled && hasBlocks(blocks) ? 'div' : 'p';

  /** Plain text between `start` and `end`: the mentions wholly inside it as chips, links. */
  function plain({ start, end }: Range): ReactNode {
    const parts: ReactNode[] = [];
    let at = start;
    for (const mention of mentions) {
      if (mention.begin < at || mention.end > end) continue;
      if (mention.begin > at) parts.push(link(at, mention.begin));
      const me = ownNick !== undefined && mention.nick.toLowerCase() === ownNick.toLowerCase();
      const named = body.slice(mention.begin, mention.end);
      parts.push(
        <span
          key={`m${mention.begin}`}
          className={cn(CHIP, me ? CHIP_ME : outgoing ? CHIP_OUT : CHIP_IN)}
          data-mention={me ? 'me' : 'other'}
        >
          {named.startsWith('@') ? named : `@${named}`}
        </span>,
      );
      at = mention.end;
    }
    if (at < end) parts.push(link(at, end));
    return parts;
  }

  function link(start: number, end: number): ReactNode {
    return <Linkify key={`l${start}`} text={body.slice(start, end)} onOpenLink={onOpenLink} />;
  }

  return (
    <Tag className={className}>
      {styled ? (
        <StyledBlocks body={body} blocks={blocks} plain={plain} />
      ) : (
        plain({ start: 0, end: body.length })
      )}
    </Tag>
  );
}
