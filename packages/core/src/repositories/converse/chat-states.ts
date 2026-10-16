import type { ChatState } from '../../contracts/types';
import { isRoom } from './mappers';
import type { ChatModel } from './models';

export type ChatStateHandler = (chatId: string, fromJid: string, state: ChatState) => void;

/**
 * XEP-0085 chat states, both ways: ours leave through the chat model, theirs are read from
 * `chat.notifications` and reported as changes only.
 */
export class ChatStates {
  private readonly handlers = new Set<ChatStateHandler>();
  /** Per room, the last state reported for each nick, to report only the changes. */
  private readonly roomStates = new WeakMap<ChatModel, Map<string, ChatState>>();

  on(handler: ChatStateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * `change:chat_state` on the model is what sends the stanza (`plugins/chat/model.js:58`,
   * `muc.js:121`; OMEMO wraps it when the chat is sealed). `setChatState()` is not used: it arms
   * Converse's own timers (`paused` after 10 s, `inactive` after 90 s) and the service already
   * drives those. The attribute is reset silently first so that a repeated state is sent again.
   */
  send(chat: ChatModel, composing: boolean): void {
    chat.set({ chat_state: null }, { silent: true });
    chat.set({ chat_state: composing ? 'composing' : 'paused' });
  }

  /**
   * Incoming XEP-0085 states live on `chat.notifications`: `chat_state` of the peer in a direct
   * chat (`null` once a message arrives, `plugins/chat/model.js:106-147`), and in a room one list
   * of nicks per state, a nick leaving a list after 10 s or on its next message (`muc.js:2345`).
   * `inactive` and `gone` are reported as `active`: the UI only cares about typing.
   */
  report(chat: ChatModel): void {
    const chatId = String(chat.get('jid'));
    if (!isRoom(chat)) {
      this.emit(chatId, chatId, toChatState(chat.notifications.get('chat_state')));
      return;
    }
    const previous = this.roomStates.get(chat) ?? new Map<string, ChatState>();
    const current = new Map<string, ChatState>();
    for (const state of ['paused', 'composing'] as const) {
      const nicks = chat.notifications.get(state);
      if (Array.isArray(nicks)) for (const nick of nicks) current.set(String(nick), state);
    }
    for (const nick of previous.keys()) if (!current.has(nick)) current.set(nick, 'active');
    this.roomStates.set(chat, new Map([...current].filter(([, state]) => state !== 'active')));
    for (const [nick, state] of current) {
      if (previous.get(nick) !== state && (state !== 'active' || previous.has(nick))) {
        this.emit(chatId, `${chatId}/${nick}`, state);
      }
    }
  }

  private emit(chatId: string, fromJid: string, state: ChatState): void {
    for (const handler of this.handlers) handler(chatId, fromJid, state);
  }
}

function toChatState(value: unknown): ChatState {
  return value === 'composing' || value === 'paused' ? value : 'active';
}
