/**
 * What the user was writing in each chat, so that a draft survives switching chats and coming
 * back. In memory for the session only, never in `localStorage` or IndexedDB: a draft may be the
 * text of a letter that would leave sealed. `App` forgets them all on sign-out.
 */
const drafts = new Map<string, string>();

export function readDraft(chatId: string): string {
  return drafts.get(chatId) ?? '';
}

/** An empty text forgets the chat's draft. */
export function writeDraft(chatId: string, body: string): void {
  if (body) drafts.set(chatId, body);
  else drafts.delete(chatId);
}

export function clearDrafts(): void {
  drafts.clear();
}
