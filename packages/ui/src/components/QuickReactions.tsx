import { useText } from '../core/CoreProvider';
import type { Emoji } from '../data/emoji';

const EMOJI =
  'size-7 cursor-pointer rounded-sm border border-line bg-paper-raised text-[16px] leading-none shadow-card hover:bg-paper focus-visible:bg-paper';

/** The viewer's favourite emojis in a letter's hover toolbar, one click each, before "React". */
export function QuickReactions({
  emojis,
  onReact,
}: {
  emojis: Emoji[];
  onReact: (emoji: string) => void;
}) {
  const text = useText();
  return emojis.map((entry) => (
    <button
      key={entry.shortname}
      type="button"
      className={EMOJI}
      aria-label={text('reaction.quick').replace('{name}', entry.shortname)}
      title={entry.shortname}
      onClick={() => onReact(entry.emoji)}
    >
      {entry.emoji}
    </button>
  ));
}
