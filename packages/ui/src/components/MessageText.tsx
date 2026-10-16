import type { Mention } from '@hey-postie/core';
import { cn } from '../lib/cn';
import { Linkify } from './Linkify';
import { mentionSegments } from './mentions';

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
  onOpenLink: (url: string) => void;
}

/** A letter's text: links clickable, mentions as `@nick` chips. Never HTML. */
export function MessageText({ body, mentions, ownNick, outgoing, onOpenLink }: MessageTextProps) {
  if (!mentions || mentions.length === 0) return <Linkify text={body} onOpenLink={onOpenLink} />;
  return (
    <>
      {mentionSegments(body, mentions).map((segment, index) => {
        const { mention } = segment;
        // biome-ignore lint/suspicious/noArrayIndexKey: segments never move, they are cut once
        if (!mention) return <Linkify key={index} text={segment.text} onOpenLink={onOpenLink} />;
        const me = ownNick !== undefined && mention.nick.toLowerCase() === ownNick.toLowerCase();
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: segments never move, they are cut once
            key={index}
            className={cn(CHIP, me ? CHIP_ME : outgoing ? CHIP_OUT : CHIP_IN)}
            data-mention={me ? 'me' : 'other'}
          >
            {segment.text.startsWith('@') ? segment.text : `@${segment.text}`}
          </span>
        );
      })}
    </>
  );
}
