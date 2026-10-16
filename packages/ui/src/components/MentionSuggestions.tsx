import { useText } from '../core/CoreProvider';
import type { MentionCandidate } from './mentions';
import { PresenceDot } from './PresenceDot';
import { LIST, OPTION } from './suggestionStyles';

interface MentionSuggestionsProps {
  id: string;
  suggestions: MentionCandidate[];
  active: number;
  optionId: (index: number) => string;
  onPick: (index: number) => void;
}

/**
 * The hall's members matching an `@` being typed, above the composer. Same keyboard model as the
 * emoji list: the text field keeps the focus and points at the active option.
 */
export function MentionSuggestions({
  id,
  suggestions,
  active,
  optionId,
  onPick,
}: MentionSuggestionsProps) {
  const text = useText();
  return (
    <div id={id} className={LIST} role="listbox" aria-label={text('composer.mentionSuggestions')}>
      {suggestions.map((person, index) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard stays in the text field, which drives the list
        <div
          key={person.nick}
          id={optionId(index)}
          role="option"
          tabIndex={-1}
          aria-selected={index === active}
          className={OPTION}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(index)}
        >
          <PresenceDot presence={person.present ? 'online' : 'offline'} />
          <span className={person.present ? undefined : 'text-ink-muted'}>@{person.nick}</span>
        </div>
      ))}
    </div>
  );
}
