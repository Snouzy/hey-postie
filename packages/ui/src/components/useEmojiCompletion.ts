import { type KeyboardEvent, useId, useState } from 'react';
import { suggestEmojis } from '../data/emoji';
import { shortcodeAt } from './composerText';

/**
 * `:shortcode` completion for the composer: while a `:sm` is typed at a word start, the emojis
 * that match. Up and Down move the active one (wrapping), Tab or Enter put it in place of the
 * shortcode, Esc puts the list away until another shortcode is started. `onKeyDown` says whether
 * it took the key, so that Enter sends only when the list is closed.
 */
export function useEmojiCompletion(
  body: string,
  onPick: (start: number, end: number, emoji: string) => void,
) {
  const listId = useId();
  const [caret, setCaret] = useState(0);
  // The shortcode (by the index of its colon) whose list the user closed with Esc.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [cursor, setCursor] = useState({ query: '', index: 0 });
  const found = shortcodeAt(body, Math.min(caret, body.length));
  const suggestions = found && found.start !== dismissed ? suggestEmojis(found.query) : [];
  const open = found !== null && suggestions.length > 0;
  // A new query starts again from the first match.
  const active = open && cursor.query === found.query ? cursor.index : 0;

  function pick(index: number) {
    const entry = suggestions[index];
    if (!found || !entry) return;
    onPick(found.start, found.start + found.query.length + 1, entry.emoji);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || event.nativeEvent.isComposing) return false;
    const count = suggestions.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setCursor({ query: found.query, index: (active + step + count) % count });
    } else if (
      (event.key === 'Enter' && !event.shiftKey) ||
      (event.key === 'Tab' && !event.shiftKey)
    ) {
      pick(active);
    } else if (event.key === 'Escape') {
      // Esc closes the list only: not the correction under way, not the details pane.
      event.stopPropagation();
      setDismissed(found.start);
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  }

  return {
    open,
    suggestions,
    active,
    listId,
    optionId: (index: number) => `${listId}-${index}`,
    /** Where the caret is: call on every change and selection of the field. */
    setCaret,
    onKeyDown,
    pick,
  };
}
