import { useText } from '../core/CoreProvider';
import type { Emoji } from '../data/emoji';

// Centred in its square by flex: an emoji glyph sits off-centre on a text baseline.
const EMOJI =
  'inline-flex size-7 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-0 text-[16px] leading-none hover:bg-paper focus-visible:bg-paper';

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
