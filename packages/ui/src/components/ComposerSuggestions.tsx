import { EmojiSuggestions } from './EmojiSuggestions';
import { MentionSuggestions } from './MentionSuggestions';
import type { ComposerCompletions } from './useComposerCompletions';

/** The open completion list, floating above the composer's row. */
export function ComposerSuggestions({ emojis, mentions }: ComposerCompletions) {
  if (emojis.open) {
    return (
      <EmojiSuggestions
        id={emojis.listId}
        suggestions={emojis.suggestions}
        active={emojis.active}
        optionId={emojis.optionId}
        onPick={emojis.pick}
      />
    );
  }
  if (!mentions.open) return null;
  return (
    <MentionSuggestions
      id={mentions.listId}
      suggestions={mentions.suggestions}
      active={mentions.active}
      optionId={mentions.optionId}
      onPick={mentions.pick}
    />
  );
}
