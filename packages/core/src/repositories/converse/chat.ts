import { DomainError } from '../../contracts/errors';
import type { ChatRepository } from '../../contracts/repositories';
import type { Chat, Message } from '../../contracts/types';
import type { ConverseEngine, Loaded } from './engine';
import { toChat, toMessage } from './mappers';
import type { ChatModel, MessageModel } from './models';

type MessageHandler = (message: Message) => void;
type ChatHandler = (chat: Chat) => void;

const DEFAULT_LIMIT = 50;
const UPDATE_EVENTS = [
  'change:received',
  'change:is_error',
  'change:retracted',
  'change:reactions',
  'change:body',
];

/** Direct chats over `_converse.state.chatboxes` (wiki/development/converse.md §4-5). */
export class ConverseChatRepository implements ChatRepository {
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly updateHandlers = new Set<MessageHandler>();
  private readonly chatHandlers = new Set<ChatHandler>();
  private readonly bound = new WeakSet<ChatModel>();
  private loaded: Loaded | null = null;
  /** The chat `open()` is showing: the only one Converse must not count unread messages for. */
  private openJid: string | null = null;

  constructor(private readonly engine: ConverseEngine) {
    engine.onReady((loaded) => this.bindCollection(loaded));
  }

  async list(): Promise<Chat[]> {
    const { api, state } = await this.engine.ready();
    await api.waitUntil('chatBoxesFetched');
    return (state.chatboxes?.models ?? []).filter(isDirect).map((chat) => this.chat(chat));
  }

  /** Opens the chat and hides the other ones: `num_unread` only counts for hidden chats (§4). */
  async open(jid: string): Promise<Chat> {
    const { api, state } = await this.engine.ready();
    this.openJid = jid;
    const chat = await api.chats.open(jid);
    if (!chat) throw new DomainError('Unknown', 'Unknown: the chat could not be opened');
    for (const other of state.chatboxes?.models ?? []) {
      if (other !== chat && isDirect(other) && !other.get('hidden')) other.save({ hidden: true });
    }
    chat.save({ hidden: false });
    return this.chat(chat);
  }

  async messages(
    chatId: string,
    options?: { before?: string; limit?: number },
  ): Promise<Message[]> {
    const chat = await this.find(chatId);
    const limit = options?.limit ?? DEFAULT_LIMIT;
    await chat.messages.fetched;
    if (!options?.before) {
      const models = this.displayable(chat.messages.models).sort(byTime).slice(-limit);
      return models.map((model) => this.message(model, chat));
    }
    return this.olderThan(chat, options.before, limit);
  }

  async send(chatId: string, body: string): Promise<Message> {
    const chat = await this.find(chatId);
    const model = await chat.sendMessage({ body });
    if (!model) throw new DomainError('Unknown', 'Unknown: the message could not be sent');
    return this.message(model, chat);
  }

  async markRead(chatId: string): Promise<void> {
    const chat = await this.find(chatId);
    chat.clearUnreadMsgCounter();
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onMessageUpdate(handler: MessageHandler): () => void {
    this.updateHandlers.add(handler);
    return () => this.updateHandlers.delete(handler);
  }

  onChatChange(handler: ChatHandler): () => void {
    this.chatHandlers.add(handler);
    return () => this.chatHandlers.delete(handler);
  }

  /** One MAM page before a message, through its stanza id (§5); the new models, oldest first. */
  private async olderThan(chat: ChatModel, before: string, limit: number): Promise<Message[]> {
    const { env, state } = await this.engine.ready();
    const stanzaId = chat.messages.get(before)?.get(`stanza_id ${state.session?.get('bare_jid')}`);
    if (typeof stanzaId !== 'string') return [];
    const added: MessageModel[] = [];
    const collect = (model: unknown) => added.push(model as MessageModel);
    chat.messages.on('add', collect);
    try {
      await env.u.mam.fetchArchivedMessages(chat, { rsm: { before: stanzaId, max: limit } }, false);
    } finally {
      chat.messages.off('add', collect);
    }
    return this.displayable(added)
      .sort(byTime)
      .map((model) => this.message(model, chat));
  }

  private async find(chatId: string): Promise<ChatModel> {
    const { api } = await this.engine.ready();
    const chat = await api.chats.get(chatId);
    if (!chat) throw new DomainError('Unknown', 'Unknown: no such chat');
    return chat;
  }

  private bindCollection(loaded: Loaded): void {
    this.loaded = loaded;
    const chatboxes = loaded.state.chatboxes;
    if (!chatboxes) return;
    for (const chat of chatboxes.models) this.bindChat(chat);
    chatboxes.on('add', (chat) => this.bindChat(chat as ChatModel));
    for (const event of ['change:num_unread', 'change:omemo_active', 'change:hidden']) {
      chatboxes.on(event, (chat) => this.emitChat(chat as ChatModel));
    }
  }

  /**
   * Converse creates every chat visible (`hidden: false`, `plugins/chat/model.js:30`) and only
   * counts `num_unread` while a chat `isHidden()`: a conversation started by an incoming message
   * would never be unread. Hidden is the right state for any chat the user has not opened.
   */
  private bindChat(chat: ChatModel): void {
    if (!isDirect(chat) || this.bound.has(chat)) return;
    this.bound.add(chat);
    if (chat.get('jid') !== this.openJid && !chat.get('hidden')) chat.save({ hidden: true });
    chat.messages.on('add', (model) => this.onAdded(chat, model as MessageModel));
    for (const event of UPDATE_EVENTS) {
      chat.messages.on(event, (model) => {
        const message = model as MessageModel;
        if (!this.isDisplayable(message)) return;
        for (const handler of this.updateHandlers) handler(this.message(message, chat));
      });
    }
  }

  /**
   * Live stanzas only: archived (MAM) results reach the UI through `messages()` and `chat.updated`,
   * never as `message.received`, otherwise the first open of a chat would notify its whole history.
   * Our own sent messages come back from `send()`; carbons from another device are new to this one.
   */
  private onAdded(chat: ChatModel, model: MessageModel): void {
    if (!this.isDisplayable(model) || model.get('is_archived')) return;
    if (model.get('sender') === 'me' && !model.get('is_carbon')) return;
    this.emitChat(chat);
    const message = this.message(model, chat);
    for (const handler of this.messageHandlers) handler(message);
  }

  private emitChat(chat: ChatModel): void {
    if (!isDirect(chat)) return;
    const mapped = this.chat(chat);
    for (const handler of this.chatHandlers) handler(mapped);
  }

  private chat(chat: ChatModel): Chat {
    const last = this.displayable(chat.messages.models).at(-1);
    return toChat(chat, last ? this.message(last, chat) : undefined);
  }

  private message(model: MessageModel, chat: ChatModel): Message {
    const authenticated = this.loaded?.api.connection.authenticated() === true;
    const unread = Number(chat.get('num_unread')) || 0;
    return toMessage(model, { chatId: String(chat.get('jid')), authenticated, unread });
  }

  private displayable(models: MessageModel[]): MessageModel[] {
    return models.filter((model) => this.isDisplayable(model));
  }

  /** Drops MAM gap placeholders, orphan reactions and transient notices; keeps decryption errors. */
  private isDisplayable(model: MessageModel): boolean {
    const placeholder = this.loaded?.MAMPlaceholderMessage;
    if (placeholder && model instanceof placeholder) return false;
    if (model.get('dangling_reaction')) return false;
    return !model.get('is_ephemeral') || model.get('error_type') === 'Decryption';
  }
}

/**
 * The collection sorts on `time` at insertion, which is not always the final order against a real
 * archive (seen once in the contract test, with a MAM page overlapping live messages).
 */
function byTime(a: MessageModel, b: MessageModel): number {
  return String(a.get('time')).localeCompare(String(b.get('time')));
}

/** `PRIVATE_CHAT_TYPE` (`shared/constants.js:66`); rooms are `chatroom`, feeds `headline`. */
function isDirect(chat: ChatModel): boolean {
  return chat.get('type') === 'chatbox';
}
