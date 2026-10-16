import type { KeyboardEvent } from 'react';
import { suggestEmojis } from '../data/emoji';
import { insertAt, shortcodeAt } from './composerText';
import { insertMention, type MentionCandidate, mentionAt, rankMentions } from './mentions';
import { useCompletion } from './useCompletion';

/**
 * The composer's two completion lists: `:shortcode` emojis everywhere, `@` members in a hall.
 * A `:` and an `@` never complete at the same caret, so at most one list is open.
 */
export function useComposerCompletions(
  body: string,
  caret: number,
  people: MentionCandidate[],
  replace: (next: { body: string; caret: number }) => void,
) {
  const emojis = useCompletion({
    body,
    caret,
    find: shortcodeAt,
    suggest: suggestEmojis,
    onPick: (start, end, entry) => replace(insertAt(body, start, end, entry.emoji)),
  });
  const mentions = useCompletion({
    body,
    caret,
    find: people.length > 0 ? mentionAt : () => null,
    suggest: (query) => rankMentions(people, query),
    onPick: (start, end, person) => replace(insertMention(body, start, end, person.nick)),
  });
  const open = emojis.open ? emojis : mentions.open ? mentions : null;
  return {
    emojis,
    mentions,
    /** True when a list took the key. */
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) =>
      emojis.onKeyDown(event) || mentions.onKeyDown(event),
    /** For the text field: the list it drives and its active option (combobox pattern). */
    fieldProps: {
      'aria-autocomplete': 'list' as const,
      'aria-controls': open?.listId,
      'aria-activedescendant': open ? open.optionId(open.active) : undefined,
    },
  };
}

export type ComposerCompletions = ReturnType<typeof useComposerCompletions>;
