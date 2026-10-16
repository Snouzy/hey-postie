import { type KeyboardEvent, useId, useState } from 'react';

/** What is being completed: where it starts in the body (its `:` or `@`) and what follows it. */
export interface Found {
  start: number;
  query: string;
}

interface Options<T> {
  body: string;
  /** Where the caret is in the field. */
  caret: number;
  /** The completion under way at the caret, if any (`shortcodeAt`, `mentionAt`). */
  find: (body: string, caret: number) => Found | null;
  /** What the query matches, best first. */
  suggest: (query: string) => T[];
  /** Puts `item` in place of `start..end` (the trigger and the query). */
  onPick: (start: number, end: number, item: T) => void;
}

/**
 * A completion list for the composer (`:shortcode` emojis, `@` mentions). While `find` sees one at
 * the caret, the matches are listed. Up and Down move the active one (wrapping), Tab or Enter put it
 * in place, Esc puts the list away until another one is started. `onKeyDown` says whether it took
 * the key, so that Enter sends only when the list is closed.
 */
export function useCompletion<T>({ body, caret, find, suggest, onPick }: Options<T>) {
  const listId = useId();
  // The completion (by the index of its trigger) whose list the user closed with Esc.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [cursor, setCursor] = useState({ query: '', index: 0 });
  const found = find(body, Math.min(caret, body.length));
  const suggestions = found && found.start !== dismissed ? suggest(found.query) : [];
  const open = found !== null && suggestions.length > 0;
  // A new query starts again from the first match.
  const active = open && cursor.query === found.query ? cursor.index : 0;

  function pick(index: number) {
    const item = suggestions[index];
    if (!found || item === undefined) return;
    onPick(found.start, found.start + found.query.length + 1, item);
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
      // Esc closes the list only: not the correction or the reply under way, not the details pane.
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
    onKeyDown,
    pick,
  };
}
