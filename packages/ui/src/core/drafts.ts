import type { Message } from '@hey-postie/core';

/**
 * What the user was writing in each chat, and the letter it answers, so that a draft survives
 * switching chats and coming back. In memory for the session only, never in `localStorage` or
 * IndexedDB: a draft may be the text of a letter that would leave sealed, and a reply quotes one.
 * `App` forgets them all on sign-out.
 */
const drafts = new Map<string, string>();
const replies = new Map<string, Message>();

export function readDraft(chatId: string): string {
  return drafts.get(chatId) ?? '';
}

/** An empty text forgets the chat's draft. */
export function writeDraft(chatId: string, body: string): void {
  if (body) drafts.set(chatId, body);
  else drafts.delete(chatId);
}

/** The letter the chat's draft answers, if any. */
export function readReply(chatId: string): Message | undefined {
  return replies.get(chatId);
}

/** `undefined` forgets it: the reply was sent or cancelled. */
export function writeReply(chatId: string, message: Message | undefined): void {
  if (message) replies.set(chatId, message);
  else replies.delete(chatId);
}

export function clearDrafts(): void {
  drafts.clear();
  replies.clear();
}
