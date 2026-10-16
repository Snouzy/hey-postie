import type { Reaction } from '@hey-postie/core';
import { useId } from 'react';
import { useText } from '../core/CoreProvider';

const SR_ONLY = 'absolute h-px w-px overflow-hidden [clip:rect(0_0_0_0)]';
// A pill on paper, so it reads on both cream and navy; mine wears the navy border.
const PILL =
  'inline-flex cursor-pointer items-center gap-1 rounded-full border border-line bg-paper-raised px-2 py-px text-[13px] leading-[1.4] text-ink transition-[background-color,border-color] duration-(--motion-fast) hover:border-navy aria-pressed:border-navy aria-pressed:bg-[color-mix(in_srgb,var(--yellow)_30%,var(--paper-raised))]';

interface ReactionsProps {
  reactions: Reaction[];
  onToggle: (emoji: string) => void;
}

/**
 * The row of pills under a bubble: each emoji with its count; mine pressed (`reaction.mine`, set
 * by the repository, which knows the occupant JID in a hall); who, in the title.
 */
export function Reactions({ reactions, onToggle }: ReactionsProps) {
  const text = useText();
  const prefix = useId();
  const shown = reactions.filter((reaction) => reaction.fromJids.length > 0);
  if (shown.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label={text('reaction.list')}>
      {shown.map((reaction, index) => {
        const who = reaction.fromJids.map(localPart).join(', ');
        const whoId = `${prefix}-${index}`;
        return (
          <li key={reaction.emoji}>
            <button
              type="button"
              className={PILL}
              aria-pressed={reaction.mine}
              aria-label={`${reaction.emoji} ${reaction.fromJids.length}`}
              aria-describedby={whoId}
              title={who}
              onClick={() => onToggle(reaction.emoji)}
            >
              <span aria-hidden>{reaction.emoji}</span>
              <span className="text-[12px] font-semibold" aria-hidden>
                {reaction.fromJids.length}
              </span>
            </button>
            {/* The tooltip's names, for those who cannot hover. */}
            <span id={whoId} className={SR_ONLY}>
              {who}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** `alice@x.org` → `alice`; `hall@rooms.x.org/alice` → `alice`. */
function localPart(jid: string): string {
  const resource = jid.split('/')[1];
  return resource ?? jid.split('@')[0] ?? jid;
}
