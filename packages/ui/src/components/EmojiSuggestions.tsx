import { useText } from '../core/CoreProvider';
import type { Emoji } from '../data/emoji';
import { LIST, OPTION } from './suggestionStyles';

interface EmojiSuggestionsProps {
  id: string;
  suggestions: Emoji[];
  active: number;
  optionId: (index: number) => string;
  onPick: (index: number) => void;
}

/**
 * The `:shortcode` matches above the composer. The focus never leaves the text field (it points
 * at the active option with `aria-activedescendant`): options swallow `mousedown`.
 */
export function EmojiSuggestions({
  id,
  suggestions,
  active,
  optionId,
  onPick,
}: EmojiSuggestionsProps) {
  const text = useText();
  return (
    <div id={id} className={LIST} role="listbox" aria-label={text('composer.emojiSuggestions')}>
      {suggestions.map((entry, index) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard stays in the text field, which drives the list
        <div
          key={entry.shortname}
          id={optionId(index)}
          role="option"
          tabIndex={-1}
          aria-selected={index === active}
          className={OPTION}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(index)}
        >
          <span className="text-[18px] leading-none" aria-hidden>
            {entry.emoji}
          </span>
          <span>:{entry.shortname}:</span>
        </div>
      ))}
    </div>
  );
}
