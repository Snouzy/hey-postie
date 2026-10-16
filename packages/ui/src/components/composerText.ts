/** Text rules of the composer: pure functions, so the component stays about the layout. */

/**
 * A `:shortcode` being typed: a colon at the start of a word, then at least two letters, digits,
 * `_`, `+` or `-` up to the caret. Its start is the colon's index. `:)` or `a:bc` are not one.
 */
export function shortcodeAt(body: string, caret: number): { start: number; query: string } | null {
  const query = body.slice(0, caret).match(/(?:^|\s):([\w+-]{2,})$/)?.[1];
  return query ? { start: caret - query.length - 1, query } : null;
}

/** `text` put where the caret is (replacing a selection); the caret lands after it. */
export function insertAt(
  body: string,
  start: number,
  end: number,
  text: string,
): { body: string; caret: number } {
  return { body: body.slice(0, start) + text + body.slice(end), caret: start + text.length };
}

/** Grows the textarea with its text. Shrinks first so that deleted lines give their room back. */
export function grow(element: HTMLTextAreaElement): void {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

/** The image files of a paste, if any: a screenshot from the clipboard becomes a parcel. */
export function pastedImages(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter((file) => file.type.startsWith('image/'));
}
