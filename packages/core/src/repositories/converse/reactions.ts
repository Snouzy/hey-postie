import { DomainError } from '../../contracts/errors';
import type { Loaded } from './engine';
import { isRoom, string } from './mappers';
import type { ChatModel, MessageModel } from './models';

export const REACTIONS_NS = 'urn:xmpp:reactions:0';

/**
 * XEP-0444: headless only receives reactions (wiki/development/converse.md §6), sending is ours.
 * Same stanza as Converse's UI plugin (`src/plugins/reactions-views/utils.js` `sendReaction`):
 * `<reactions id=…>` names the target by `msgid`, or by the room's `stanza_id` in a room, with a
 * `<store/>` hint; in a sealed chat the element travels inside the OMEMO payload.
 */
export async function sendReactions(
  loaded: Loaded,
  chat: ChatModel,
  message: MessageModel,
  emojis: string[],
): Promise<void> {
  const { api, env } = loaded;
  const { stx, Strophe, u } = env;
  const chatJid = string(chat.get('jid'));
  const room = isRoom(chat);
  const targetId =
    (room && string(message.get(`stanza_id ${chatJid}`))) ||
    string(message.get('msgid')) ||
    string(message.get('id'));
  const reactions = stx`<reactions xmlns="${REACTIONS_NS}" id="${targetId}">${emojis.map(
    (emoji) => stx`<reaction>${emoji}</reaction>`,
  )}</reactions>`;

  if (chat.get('omemo_active')) {
    if (!api.omemo) {
      throw new DomainError('EncryptionUnavailable', 'EncryptionUnavailable: no OMEMO plugin');
    }
    // Legacy OMEMO carries no structured content: the emojis go in the body as a fallback, marked
    // as such (XEP-0428) so that reaction-aware clients drop it.
    const fallback = emojis.join(' ');
    const extensions = fallback
      ? [
          reactions,
          stx`<fallback xmlns="${Strophe.NS.FALLBACK}" for="${REACTIONS_NS}"><body/></fallback>`,
        ]
      : [reactions];
    try {
      await api.omemo.send(chat, fallback || null, extensions);
    } catch (cause) {
      throw new DomainError('Unknown', 'Unknown: the reaction could not be encrypted', cause);
    }
  } else {
    api.send(
      stx`<message to="${chatJid}" type="${room ? 'groupchat' : 'chat'}" id="${u.getUniqueId('reaction')}" xmlns="jabber:client">${reactions}<store xmlns="${Strophe.NS.HINTS}"/></message>`,
    );
  }

  // Our own stanza is not echoed back in a direct chat: record it, which raises `change:reactions`.
  const own = u.reactions?.getOwnReactionJID(chat) ?? string(loaded.state.session?.get('bare_jid'));
  const current = message.get('reactions');
  const next: Record<string, unknown> =
    current && typeof current === 'object' ? { ...(current as Record<string, unknown>) } : {};
  if (emojis.length > 0) next[own] = emojis;
  else delete next[own];
  message.save({ reactions: next });
}
