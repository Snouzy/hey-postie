import { DomainError } from '../../contracts/errors';
import type { ChatRepository } from '../../contracts/repositories';
import type { Chat, Message } from '../../contracts/types';
import type { ConverseEngine, Loaded } from './engine';
import { isRoom, toChat, toMessage } from './mappers';
import type { ChatModel, MessageModel } from './models';
import { REACTIONS_NS, sendReactions } from './reactions';
import {
  AESGCM_OVERHEAD_BYTES,
  discoverUploadService,
  type UploadService,
  uploadFile,
} from './upload';

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

/**
 * Direct chats and rooms over `_converse.state.chatboxes` (wiki/development/converse.md §4-5 and
 * "Rooms (MUC)"): a room's messages flow here too, with `chatId` = the room's bare JID.
 */
export class ConverseChatRepository implements ChatRepository {
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly updateHandlers = new Set<MessageHandler>();
  private readonly chatHandlers = new Set<ChatHandler>();
  private readonly bound = new WeakSet<ChatModel>();
  private loaded: Loaded | null = null;
  /** The chat the user looks at. Every other direct chat is hidden so that `num_unread` counts (§4). */
  private openJid: string | null = null;
  /** The upload component of the session's server, discovered once per connection. */
  private uploadService: Promise<UploadService | null> | null = null;
  /** One upload at a time per chat: `uploadFile` identifies its placeholder by order of arrival. */
  private readonly uploads = new Map<string, Promise<unknown>>();
  /** The chats that were already there when a connection came up: they need a MAM catch-up. */
  private survivors = new Set<ChatModel>();

  constructor(private readonly engine: ConverseEngine) {
    engine.onReady((loaded) => this.bindCollection(loaded));
    engine.on('addClientFeatures', () => engine.current?.api.disco.own.features.add(REACTIONS_NS));
    engine.on('disconnected', () => {
      this.uploadService = null;
    });
    engine.on('connected', () => {
      const models = engine.current?.state.chatboxes?.models ?? [];
      this.survivors = new Set(models.filter(isChat));
    });
    engine.on('chatBoxesFetched', () => this.catchUp());
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
    return model && this.displayable([model]).length > 0 ? this.mapMessage(model, chat) : null;
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
      return models.map((model) => this.mapMessage(model, chat));
    }
    return this.olderThan(chat, options.before, limit);
  }

  async send(chatId: string, body: string): Promise<Message> {
    const chat = await this.find(chatId);
    const model = await chat.sendMessage({ body });
    if (!model) throw new DomainError('Unknown', 'Unknown: the message could not be sent');
    return this.mapMessage(model, chat);
  }

  /** The bare JID of the signed-in account, the key of our own reactions in a direct chat. */
  selfJid(): string {
    return String(this.engine.current?.state.session?.get('bare_jid') ?? '').toLowerCase();
  }

  /**
   * Converse checks the limit itself but answers with an ephemeral notice: the check runs here
   * first so that the caller gets `FileTooLarge`; in a sealed chat the encrypted upload carries the
   * AES-GCM tag on top of the file. Converse knows no file size on a message, so the sent
   * attachment takes the size of the file we uploaded.
   */
  async sendFile(
    chatId: string,
    file: File,
    onProgress?: (fraction: number) => void,
  ): Promise<Message> {
    const chat = await this.find(chatId);
    const limit = await this.maxFileSize();
    const uploaded = chat.get('omemo_active') ? file.size + AESGCM_OVERHEAD_BYTES : file.size;
    if (limit !== null && uploaded > limit) {
      throw new DomainError('FileTooLarge', `FileTooLarge: limit ${limit} bytes`);
    }
    const previous = this.uploads.get(chatId) ?? Promise.resolve();
    const run = previous.then(() => uploadFile(chat, file, onProgress));
    this.uploads.set(
      chatId,
      run.catch(() => undefined),
    );
    const message = this.mapMessage(await run, chat);
    return {
      ...message,
      attachments: message.attachments.map((attachment) => ({ ...attachment, size: file.size })),
    };
  }

  async maxFileSize(): Promise<number | null> {
    const loaded = await this.engine.ready();
    if (!this.uploadService) {
      this.uploadService = discoverUploadService(loaded).catch((cause: unknown) => {
        this.uploadService = null;
        throw new DomainError('Unknown', 'Unknown: upload service discovery failed', cause);
      });
    }
    return (await this.uploadService)?.maxFileSize ?? null;
  }

  async react(chatId: string, messageId: string, emojis: string[]): Promise<void> {
    const loaded = await this.engine.ready();
    const chat = await this.find(chatId);
    const model = chat.messages.get(messageId);
    if (!model) throw new DomainError('Unknown', 'Unknown: no such message');
    await sendReactions(loaded, chat, model, emojis);
  }

  async markRead(chatId: string): Promise<void> {
    const chat = await this.find(chatId);
    await chat.clearUnreadMsgCounter();
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

  // Chat states (XEP-0085) are not implemented yet: see wiki/development/converse.md
  // "To implement". Sending refuses (the service swallows it), nothing fires.
  async setComposing(): Promise<void> {
    throw new DomainError('Unknown', 'Unknown: not implemented yet in the Converse repository');
  }

  onChatState(): () => void {
    return () => undefined;
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

  /**
   * One MAM page before a message, through its stanza id (§5); the archived models, oldest first.
   * The id is stamped by the archive: our own account for a direct chat, the room for a room.
   */
  private async olderThan(chat: ChatModel, before: string, limit: number): Promise<Message[]> {
    const { env, state } = await this.engine.ready();
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
    return this.displayable(added.filter((model) => model.get('is_archived')))
      .sort(byTime)
      .map((model) => this.mapMessage(model, chat));
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
    this.loaded = loaded;
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
    chat.messages.on('add', (model) => this.onAdded(chat, model as MessageModel));
    for (const event of UPDATE_EVENTS) {
      chat.messages.on(event, (model) => {
        const message = model as MessageModel;
        if (!this.isDisplayable(message)) return;
        for (const handler of this.updateHandlers) handler(this.mapMessage(message, chat));
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
    this.emitChat(chat);
    if (model.get('sender') === 'me' && !model.get('is_carbon')) return;
    const message = this.mapMessage(model, chat);
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
    const last = this.displayable(chat.messages.models).at(-1);
    return toChat(chat, last ? this.mapMessage(last, chat) : undefined);
  }

  private mapMessage(model: MessageModel, chat: ChatModel): Message {
    const authenticated = this.loaded?.api.connection.authenticated() === true;
    const unread = Number(chat.get(isRoom(chat) ? 'num_unread_general' : 'num_unread')) || 0;
    const ownReactionJid = this.loaded?.env.u.reactions?.getOwnReactionJID(chat);
    const context = {
      chatId: String(chat.get('jid')),
      authenticated,
      unread,
      ...(ownReactionJid ? { ownReactionJid } : {}),
    };
    return toMessage(
      model,
      isRoom(chat) ? { ...context, ownNick: String(chat.get('nick')) } : context,
    );
  }

  private displayable(models: MessageModel[]): MessageModel[] {
    return models.filter((model) => this.isDisplayable(model));
  }

  /**
   * Drops MAM gap placeholders, upload placeholders (`file: true`, their progress goes through
   * `sendFile`), orphan reactions and retractions (§6, `model-with-messages.js:985`) and transient
   * notices; keeps decryption errors.
   */
  private isDisplayable(model: MessageModel): boolean {
    const placeholder = this.loaded?.MAMPlaceholderMessage;
    if (placeholder && model instanceof placeholder) return false;
    if (model.get('file') || model.get('dangling_reaction') || model.get('dangling_retraction')) {
      return false;
    }
    return !model.get('is_ephemeral') || model.get('error_type') === 'Decryption';
  }
}

/**
 * The collection sorts on `time` at insertion only; one contract run against a real archive (a MAM
 * page overlapping live messages) returned it out of order, so both read paths sort themselves.
 */
function byTime(a: MessageModel, b: MessageModel): number {
  return String(a.get('time')).localeCompare(String(b.get('time')));
}

/** `PRIVATE_CHAT_TYPE` and `CHATROOMS_TYPE` (`shared/constants.js:66-67`); feeds (`headline`) are not chats. */
function isChat(chat: ChatModel): boolean {
  return chat.get('type') === 'chatbox' || isRoom(chat);
}
