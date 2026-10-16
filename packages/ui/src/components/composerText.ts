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

/** ⌘B, ⌘I and ⌘E (Ctrl elsewhere): the XEP-0393 directive each one wraps the selection with. */
const FORMAT_KEYS: Record<string, string> = { b: '*', i: '_', e: '`' };

export function formatMarker(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): string | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null;
  return FORMAT_KEYS[event.key.toLowerCase()] ?? null;
}

/**
 * The selection wrapped in `marker` (XEP-0393 styling), selected again afterwards. A span never
 * crosses a line and its directives must touch text, so each line is wrapped on its own, its outer
 * spaces left outside; code over several lines becomes a ``` block on lines of its own. Nothing
 * selected: the pair, with the caret between.
 */
export function wrapSelection(
  body: string,
  start: number,
  end: number,
  marker: string,
): { body: string; start: number; end: number } {
  if (start === end) {
    const caret = start + marker.length;
    return {
      body: body.slice(0, start) + marker + marker + body.slice(end),
      start: caret,
      end: caret,
    };
  }
  const selected = body.slice(start, end);
  let wrapped: string;
  if (marker === '`' && selected.includes('\n')) {
    const before = start > 0 && body[start - 1] !== '\n' ? '\n' : '';
    const after = end < body.length && body[end] !== '\n' ? '\n' : '';
    wrapped = `${before}\`\`\`\n${selected}\n\`\`\`${after}`;
  } else {
    wrapped = selected
      .split('\n')
      .map((line) => {
        const [, lead = '', text = '', trail = ''] = line.match(/^(\s*)(.*?)(\s*)$/) ?? [];
        return text ? `${lead}${marker}${text}${marker}${trail}` : line;
      })
      .join('\n');
  }
  return {
    body: body.slice(0, start) + wrapped + body.slice(end),
    start,
    end: start + wrapped.length,
  };
}
