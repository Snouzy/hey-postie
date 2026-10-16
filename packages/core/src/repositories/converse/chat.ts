import { DomainError } from '../../contracts/errors';
import type { ChatRepository } from '../../contracts/repositories';
import type { Chat, Message, SendOptions } from '../../contracts/types';
import { newestMessages, olderMessages } from './chat-history';
import { displayable, isChat, isDisplayable, mapChat, mapMessage } from './chat-messages';
import { ChatSender } from './chat-sending';
import { type ChatStateHandler, ChatStates } from './chat-states';
import type { ConverseEngine, Loaded } from './engine';
import { isRoom } from './mappers';
import type { ChatModel, MessageModel } from './models';
import { REACTIONS_NS } from './reactions';
import { addMarkerType, applyReadMarker } from './read-markers';
import { ConverseReadSync } from './read-sync';

type MessageHandler = (message: Message) => void;
type ChatHandler = (chat: Chat) => void;

const DEFAULT_LIMIT = 50;
const UPDATE_EVENTS = [
  'change:received',
  'change:is_error',
  'change:retracted',
  'change:moderated',
  'change:edited',
  'change:reactions',
  'change:body',
  // A hall's link preview arrives after its letter (`handleMetadataFastening`).
  'change:ogp_metadata',
];

/**
 * Direct chats and rooms over `_converse.state.chatboxes` (wiki/development/converse.md §4-5 and
 * "Rooms (MUC)"): a room's messages flow here too, with `chatId` = the room's bare JID. Reading
 * pages is `chat-history.ts`, sending `chat-sending.ts`, typing `chat-states.ts`, and the mapping
 * of models `chat-messages.ts`; this class finds the chats and reports what changes.
 */
export class ConverseChatRepository implements ChatRepository {
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly updateHandlers = new Set<MessageHandler>();
  private readonly chatHandlers = new Set<ChatHandler>();
  private readonly bound = new WeakSet<ChatModel>();
  /** The chat the user looks at. Every other direct chat is hidden so that `num_unread` counts (§4). */
  private openJid: string | null = null;
  /** The chats that were already there when a connection came up: they need a MAM catch-up. */
  private survivors = new Set<ChatModel>();
  /** XEP-0490: the read position shared with our other devices. */
  private readonly readSync: ConverseReadSync;
  private readonly sender: ChatSender;
  private readonly states = new ChatStates();

  constructor(private readonly engine: ConverseEngine) {
    this.readSync = new ConverseReadSync(engine);
    this.sender = new ChatSender(engine);
    engine.onReady((loaded) => this.bindCollection(loaded));
    engine.on('addClientFeatures', () => engine.current?.api.disco.own.features.add(REACTIONS_NS));
    engine.on('connected', () => {
      const models = engine.current?.state.chatboxes?.models ?? [];
      this.survivors = new Set(models.filter(isChat));
    });
    engine.on('chatBoxesFetched', () => this.catchUp());
    // Converse keeps a marker's id but not its type: the hooks add it, `message` applies it.
    engine.on('parseMessage', addMarkerType);
    engine.on('parseEncryptedContent', addMarkerType);
    engine.on('message', (data) => this.onReadMarker(data));
  }

  /** A peer read our letters up to one of them: they and the chat's preview change status. */
  private onReadMarker(data: unknown): void {
    const { attrs, chatbox } = (data ?? {}) as { attrs?: unknown; chatbox?: ChatModel | null };
    if (!chatbox || isRoom(chatbox) || !attrs || typeof attrs !== 'object') return;
    const read = applyReadMarker(chatbox, attrs as Record<string, unknown>);
    if (read.length === 0) return;
    for (const model of displayable(this.engine.current, read)) {
      for (const handler of this.updateHandlers) handler(this.map(model, chatbox));
    }
    this.emitChat(chatbox);
  }

  /** Off: no `displayed` marker leaves, in direct chats and halls alike (see the engine). */
  setSendReadMarkers(send: boolean): void {
    this.engine.setSendDisplayed(send);
  }

  /**
   * Sign-out then sign-in keeps the chat models (`onClearSession` only clears an untrusted cache),
   * and Converse re-fetches archives only for chats it creates or on an automatic reconnection
   * (`reconnected` → `onReconnection`): a chat that survived would never learn what arrived while
   * signed out. Its own reconnection path is run instead: `chatReconnected` → `fetchNewestMessages`
   * (`plugins/mam/plugin.js:61`), and a room rejoins first. Found by the contract test on 2026-10-16.
   */
  private catchUp(): void {
    const chatboxes = this.engine.current?.state.chatboxes;
    for (const chat of this.survivors) {
      if (chatboxes?.get(String(chat.get('jid'))) !== chat) continue;
      chat.onReconnection().catch(() => console.warn('converse: catch-up failed', chat.get('jid')));
    }
    this.survivors.clear();
  }

  async list(): Promise<Chat[]> {
    const { api, state } = await this.engine.ready();
    await api.waitUntil('chatBoxesFetched');
    return (state.chatboxes?.models ?? []).filter(isChat).map((chat) => this.chat(chat));
  }

  /**
   * Opens the chat and hides the other ones: `num_unread` only counts for hidden chats (§4).
   * A room is never created here: it must have been joined through `RoomRepository.join`, so a
   * room JID without a model (a bookmark, or a JID on a known conference service) is refused
   * rather than turned into a direct chat.
   */
  async open(jid: string): Promise<Chat> {
    const { api, state } = await this.engine.ready();
    const bare = jid.toLowerCase();
    this.openJid = bare;
    const existing = state.chatboxes?.get(bare);
    if (!existing && (await this.isRoomJid(bare))) {
      throw new DomainError('RoomNotFound', 'RoomNotFound: the room is not joined');
    }
    const chat = existing && isRoom(existing) ? existing : await api.chats.open(bare);
    if (!chat) throw new DomainError('Unknown', 'Unknown: the chat could not be opened');
    for (const other of state.chatboxes?.models ?? []) {
      if (other !== chat && isChat(other)) this.hideUnlessOpen(other);
    }
    this.hideUnlessOpen(chat);
    return this.chat(chat);
  }

  async message(chatId: string, messageId: string): Promise<Message | null> {
    const chat = await this.find(chatId);
    await chat.messages.fetched;
    const model = chat.messages.get(messageId);
    return model && isDisplayable(this.engine.current, model) ? this.map(model, chat) : null;
  }

  async messages(
    chatId: string,
    options?: { before?: string; limit?: number },
  ): Promise<Message[]> {
    const chat = await this.find(chatId);
    const limit = options?.limit ?? DEFAULT_LIMIT;
    const loaded = await this.engine.ready();
    if (!options?.before) return newestMessages(loaded, chat, limit);
    return olderMessages(loaded, chat, options.before, limit);
  }

  async send(chatId: string, body: string, options: SendOptions = {}): Promise<Message> {
    const chat = await this.find(chatId);
    return this.sender.send(chat, chatId, body, options);
  }

  /** The bare JID of the signed-in account, the key of our own reactions in a direct chat. */
  selfJid(): string {
    return String(this.engine.current?.state.session?.get('bare_jid') ?? '').toLowerCase();
  }

  async sendFile(
    chatId: string,
    file: File,
    onProgress?: (fraction: number) => void,
  ): Promise<Message> {
    const chat = await this.find(chatId);
    return this.sender.sendFile(chat, chatId, file, onProgress);
  }

  maxFileSize(): Promise<number | null> {
    return this.sender.maxFileSize();
  }

  async react(chatId: string, messageId: string, emojis: string[]): Promise<void> {
    await this.engine.ready();
    const chat = await this.find(chatId);
    await this.sender.react(chat, messageId, emojis);
  }

  async correct(chatId: string, messageId: string, body: string): Promise<Message> {
    const chat = await this.find(chatId);
    return this.sender.correct(chat, chatId, messageId, body);
  }

  async retract(chatId: string, messageId: string): Promise<void> {
    const chat = await this.find(chatId);
    await this.sender.retract(chat, messageId);
  }

  async markRead(chatId: string): Promise<void> {
    const chat = await this.find(chatId);
    await chat.clearUnreadMsgCounter();
    this.readSync.publish(chat).catch(() => console.warn('read sync: publish failed'));
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

  async setComposing(chatId: string, composing: boolean): Promise<void> {
    this.states.send(await this.find(chatId), composing);
  }

  onChatState(handler: ChatStateHandler): () => void {
    return this.states.on(handler);
  }

  /** A bookmarked room, or any JID on a domain already discovered as a conference service. */
  private async isRoomJid(jid: string): Promise<boolean> {
    const { api, state } = await this.engine.ready();
    if (state.bookmarks?.get(jid)) return true;
    const domain = jid.split('@')[1];
    if (!domain) return false;
    const entity = await api.disco.entities.get(domain);
    return Boolean(entity?.identities.findWhere({ category: 'conference', type: 'text' }));
  }

  /** Straight from the collection: `api.chats.get` only answers for direct chats. */
  private async find(chatId: string): Promise<ChatModel> {
    const { api, state } = await this.engine.ready();
    await api.waitUntil('chatBoxesFetched');
    const chat = state.chatboxes?.get(chatId.toLowerCase());
    if (!chat || !isChat(chat)) throw new DomainError('Unknown', 'Unknown: no such chat');
    return chat;
  }

  private bindCollection(loaded: Loaded): void {
    const chatboxes = loaded.state.chatboxes;
    if (!chatboxes) return;
    for (const chat of chatboxes.models) this.bindChat(chat);
    chatboxes.on('add', (chat) => this.bindChat(chat as ChatModel));
    const events = [
      'change:num_unread',
      'change:num_unread_general',
      'change:omemo_active',
      'change:hidden',
    ];
    for (const event of events) {
      chatboxes.on(event, (chat) => this.emitChat(chat as ChatModel));
    }
  }

  private bindChat(chat: ChatModel): void {
    if (!isChat(chat) || this.bound.has(chat)) return;
    this.bound.add(chat);
    // In overlayed mode a new chat is born visible (`plugins/chat/model.js:30`): hide it unless
    // it is the open one, otherwise its unread messages would never be counted. Converse also
    // unhides a room by itself when its bookmark is created (`openBookmarkedRoom` → `maybeShow`).
    this.hideUnlessOpen(chat);
    chat.on('change:hidden', () => this.hideUnlessOpen(chat));
    chat.notifications.on('change', () => this.states.report(chat));
    chat.messages.on('add', (model) => this.onAdded(chat, model as MessageModel));
    for (const event of UPDATE_EVENTS) {
      chat.messages.on(event, (model) => {
        const message = model as MessageModel;
        if (!isDisplayable(this.engine.current, message)) return;
        for (const handler of this.updateHandlers) handler(this.map(message, chat));
      });
    }
  }

  /**
   * Live stanzas only: archived (MAM) results reach the UI through `messages()` and `chat.updated`,
   * never as `message.received`, otherwise the first open of a chat would notify its whole history.
   * Our own sent messages come back from `send()`; carbons from another device are new to this one.
   */
  private onAdded(chat: ChatModel, model: MessageModel): void {
    if (!isDisplayable(this.engine.current, model) || model.get('is_archived')) return;
    this.emitChat(chat);
    if (model.get('sender') === 'me' && !model.get('is_carbon')) return;
    const message = this.map(model, chat);
    for (const handler of this.messageHandlers) handler(message);
  }

  private hideUnlessOpen(chat: ChatModel): void {
    const hidden = String(chat.get('jid')).toLowerCase() !== this.openJid;
    if (chat.get('hidden') !== hidden) chat.save({ hidden });
  }

  private emitChat(chat: ChatModel): void {
    if (!isChat(chat)) return;
    const mapped = this.chat(chat);
    for (const handler of this.chatHandlers) handler(mapped);
  }

  private chat(chat: ChatModel): Chat {
    return mapChat(this.engine.current, chat);
  }

  private map(model: MessageModel, chat: ChatModel): Message {
    return mapMessage(this.engine.current, model, chat);
  }
}
