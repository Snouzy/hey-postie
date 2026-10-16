import type { Message } from '../../contracts/types';
import { byTime, displayable, mapMessage } from './chat-messages';
import type { Loaded } from './engine';
import { isRoom } from './mappers';
import type { ChatModel, MessageModel } from './models';

/** A chat's letters, newest page first then older pages from the archive (converse.md §5). */

/** The newest letters already in the collection, oldest first. */
export async function newestMessages(
  loaded: Loaded,
  chat: ChatModel,
  limit: number,
): Promise<Message[]> {
  await chat.messages.fetched;
  const models = displayable(loaded, chat.messages.models).sort(byTime).slice(-limit);
  return models.map((model) => mapMessage(loaded, model, chat));
}

/**
 * One MAM page before a message, through its stanza id (§5); the archived models, oldest first.
 * The id is stamped by the archive: our own account for a direct chat, the room for a room.
 */
export async function olderMessages(
  loaded: Loaded,
  chat: ChatModel,
  before: string,
  limit: number,
): Promise<Message[]> {
  await chat.messages.fetched;
  const { env, state } = loaded;
  const archive = isRoom(chat) ? chat.get('jid') : state.session?.get('bare_jid');
  const stanzaId = chat.messages.get(before)?.get(`stanza_id ${String(archive)}`);
  if (typeof stanzaId !== 'string') return [];
  const added: MessageModel[] = [];
  const collect = (model: unknown) => added.push(model as MessageModel);
  chat.messages.on('add', collect);
  try {
    await env.u.mam.fetchArchivedMessages(chat, { rsm: { before: stanzaId, max: limit } }, false);
    // The results are queued, not awaited, by `handleMAMResult`: wait for the queue to drain.
    await chat.msg_chain;
  } finally {
    chat.messages.off('add', collect);
  }
  // A live message arriving meanwhile is also added to the collection: it is not history.
  return displayable(
    loaded,
    added.filter((model) => model.get('is_archived')),
  )
    .sort(byTime)
    .map((model) => mapMessage(loaded, model, chat));
}
