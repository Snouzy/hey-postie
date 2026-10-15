/** Text rules of the composer: pure functions, so the component stays about the layout. */

/**
 * The word before the caret, completed into the nick it equals, else the first nick that starts
 * with it (ignoring case): `nick: ` at the start of a line, `nick ` elsewhere (no second space
 * when one follows already). Nothing to complete returns null.
 */
export function completeNick(
  body: string,
  caret: number,
  nicks: string[],
): { body: string; caret: number } | null {
  const before = body.slice(0, caret);
  const word = before.match(/\S+$/)?.[0];
  if (!word) return null;
  const lower = word.toLowerCase();
  const nick =
    nicks.find((candidate) => candidate.toLowerCase() === lower) ??
    nicks.find((candidate) => candidate.toLowerCase().startsWith(lower));
  if (!nick) return null;
  const start = caret - word.length;
  const atLineStart = start === 0 || before[start - 1] === '\n';
  const inserted = atLineStart ? `${nick}:` : nick;
  const completed = body[caret] === ' ' ? inserted : `${inserted} `;
  return {
    body: before.slice(0, start) + completed + body.slice(caret),
    caret: start + completed.length,
  };
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
