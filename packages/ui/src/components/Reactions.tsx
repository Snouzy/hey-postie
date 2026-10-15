import type { Reaction } from '@hey-postie/core';
import { useText } from '../core/CoreProvider';
import styles from './Reactions.module.css';

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
  const shown = reactions.filter((reaction) => reaction.fromJids.length > 0);
  if (shown.length === 0) return null;
  return (
    <ul className={styles.list} aria-label={text('reaction.list')}>
      {shown.map((reaction) => {
        const who = reaction.fromJids.map(localPart).join(', ');
        return (
          <li key={reaction.emoji}>
            <button
              type="button"
              className={styles.pill}
              aria-pressed={reaction.mine}
              aria-label={`${reaction.emoji} ${reaction.fromJids.length}`}
              title={who}
              onClick={() => onToggle(reaction.emoji)}
            >
              <span aria-hidden>{reaction.emoji}</span>
              <span className={styles.count} aria-hidden>
                {reaction.fromJids.length}
              </span>
            </button>
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
