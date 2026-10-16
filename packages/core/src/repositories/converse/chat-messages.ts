import type { Chat, Message } from '../../contracts/types';
import type { Loaded } from './engine';
import { isRoom, toChat, toMessage } from './mappers';
import type { ChatModel, MessageModel } from './models';
import { READ_UNTIL } from './read-markers';

/**
 * What the chat repository shows of Converse's message models: which ones are letters, and how a
 * model and its chat become a `Message` or a `Chat` (wiki/development/converse.md §4-6).
 */

/** `PRIVATE_CHAT_TYPE` and `CHATROOMS_TYPE` (`shared/constants.js:66-67`); feeds (`headline`) are not chats. */
export function isChat(chat: ChatModel): boolean {
  return chat.get('type') === 'chatbox' || isRoom(chat);
}

/**
 * The collection sorts on `time` at insertion only; one contract run against a real archive (a MAM
 * page overlapping live messages) returned it out of order, so both read paths sort themselves.
 */
export function byTime(a: MessageModel, b: MessageModel): number {
  return String(a.get('time')).localeCompare(String(b.get('time')));
}

/**
 * Drops MAM gap placeholders, upload placeholders (`file: true`, their progress goes through
 * `sendFile`), orphan reactions and retractions (§6, `model-with-messages.js:985`) and transient
 * notices; keeps decryption errors.
 */
export function isDisplayable(loaded: Loaded | null, model: MessageModel): boolean {
  const placeholder = loaded?.MAMPlaceholderMessage;
  if (placeholder && model instanceof placeholder) return false;
  if (model.get('file') || model.get('dangling_reaction') || model.get('dangling_retraction')) {
    return false;
  }
  // Converse marks our own retraction ephemeral; it stays, shown as "deleted".
  if (model.get('retracted')) return true;
  return !model.get('is_ephemeral') || model.get('error_type') === 'Decryption';
}

export function displayable(loaded: Loaded | null, models: MessageModel[]): MessageModel[] {
  return models.filter((model) => isDisplayable(loaded, model));
}

export function mapMessage(loaded: Loaded | null, model: MessageModel, chat: ChatModel): Message {
  const authenticated = loaded?.api.connection.authenticated() === true;
  const unread = Number(chat.get(isRoom(chat) ? 'num_unread_general' : 'num_unread')) || 0;
  const ownReactionJid = loaded?.env.u.reactions?.getOwnReactionJID(chat);
  const readUntil = chat.get(READ_UNTIL);
  const context = {
    chatId: String(chat.get('jid')),
    authenticated,
    unread,
    ...(ownReactionJid ? { ownReactionJid } : {}),
    ...(typeof readUntil === 'string' && !isRoom(chat) ? { readUntil } : {}),
    replied: (id: string) => chat.getReferencedMessage?.(id),
  };
  return toMessage(
    model,
    isRoom(chat) ? { ...context, ownNick: String(chat.get('nick')) } : context,
  );
}

/** A chat with its last letter as the preview. */
export function mapChat(loaded: Loaded | null, chat: ChatModel): Chat {
  const last = displayable(loaded, chat.messages.models).at(-1);
  return toChat(chat, last ? mapMessage(loaded, last, chat) : undefined);
}
