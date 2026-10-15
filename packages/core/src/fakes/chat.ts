import type { ChatRepository } from '../contracts/repositories';
import type { Chat, Message } from '../contracts/types';

type MessageHandler = (message: Message) => void;
type ChatHandler = (chat: Chat) => void;

/**
 * In-memory chats. `receive()` simulates an incoming message, `history()` seeds older pages
 * that `messages({ before })` returns, so services can be tested without a server.
 */
export class FakeChat implements ChatRepository {
  private readonly chats = new Map<string, Chat>();
  private readonly byChat = new Map<string, Message[]>();
  private readonly archive = new Map<string, Message[]>();
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly updateHandlers = new Set<MessageHandler>();
  private readonly chatHandlers = new Set<ChatHandler>();
  private counter = 0;
  /** The chat the user is looking at: like the real one, it does not count unread messages. */
  private openId: string | null = null;
  readonly sent: Message[] = [];
  readonly markedRead: string[] = [];
  readonly reactions: Array<{ chatId: string; messageId: string; emojis: string[] }> = [];
  readonly uploaded: Array<{ chatId: string; name: string }> = [];
  maxUpload: number | null = 5 * 1024 * 1024;
  myJid = 'me@example.org';

  /** Older messages, oldest first, that the server would return on demand. */
  history(chatId: string, messages: Message[]): void {
    this.archive.set(chatId, messages);
  }

  /** An incoming message from the server. `kind` applies when the chat is created by this call. */
  receive(
    input: Partial<Message> & {
      chatId: string;
      fromJid: string;
      body: string;
      kind?: Chat['kind'];
    },
  ): Message {
    const { kind, ...rest } = input;
    const chat = this.ensureChat(input.chatId, input.fromJid, kind);
    const message = this.build({ direction: 'in', ...rest });
    this.append(chat, message);
    for (const handler of this.messageHandlers) handler(message);
    return message;
  }

  /** A status change (delivered, read, failed) coming from the server. */
  update(message: Message): void {
    const list = this.byChat.get(message.chatId) ?? [];
    const index = list.findIndex((m) => m.id === message.id);
    if (index >= 0) list[index] = message;
    for (const handler of this.updateHandlers) handler(message);
  }

  selfJid(): string {
    return this.myJid;
  }

  async list(): Promise<Chat[]> {
    return [...this.chats.values()];
  }

  async open(jid: string): Promise<Chat> {
    this.openId = jid;
    return this.ensureChat(jid, jid);
  }

  async messages(
    chatId: string,
    options?: { before?: string; limit?: number },
  ): Promise<Message[]> {
    if (options?.before) {
      const older = this.archive.get(chatId) ?? [];
      this.archive.set(chatId, []);
      const current = this.byChat.get(chatId) ?? [];
      this.byChat.set(chatId, [...older, ...current]);
      return older;
    }
    const all = this.byChat.get(chatId) ?? [];
    return options?.limit ? all.slice(-options.limit) : [...all];
  }

  async send(chatId: string, body: string): Promise<Message> {
    const chat = this.ensureChat(chatId, chatId);
    const message = this.build({ chatId, fromJid: 'me', body, direction: 'out', status: 'sent' });
    this.append(chat, message);
    this.sent.push(message);
    return message;
  }

  async sendFile(
    chatId: string,
    file: File,
    onProgress?: (fraction: number) => void,
  ): Promise<Message> {
    const chat = this.ensureChat(chatId, chatId);
    onProgress?.(0.5);
    onProgress?.(1);
    this.uploaded.push({ chatId, name: file.name });
    const message = this.build({
      chatId,
      fromJid: this.myJid,
      body: '',
      direction: 'out',
      status: 'sent',
      attachments: [
        {
          url: `https://upload.example.org/${encodeURIComponent(file.name)}`,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          encryption: 'none',
        },
      ],
    });
    this.append(chat, message);
    this.sent.push(message);
    return message;
  }

  async maxFileSize(): Promise<number | null> {
    return this.maxUpload;
  }

  /** Replaces this account's reactions on the message and reports the update. */
  async react(chatId: string, messageId: string, emojis: string[]): Promise<void> {
    this.reactions.push({ chatId, messageId, emojis });
    const message = (this.byChat.get(chatId) ?? []).find((m) => m.id === messageId);
    if (!message) return;
    const others = message.reactions
      .map((r) => ({
        emoji: r.emoji,
        fromJids: r.fromJids.filter((j) => j !== this.myJid),
        mine: false,
      }))
      .filter((r) => r.fromJids.length > 0);
    for (const emoji of emojis) {
      const existing = others.find((r) => r.emoji === emoji);
      if (existing) {
        existing.fromJids.push(this.myJid);
        existing.mine = true;
      } else others.push({ emoji, fromJids: [this.myJid], mine: true });
    }
    this.update({ ...message, reactions: others });
  }

  async markRead(chatId: string): Promise<void> {
    this.markedRead.push(chatId);
    const chat = this.chats.get(chatId);
    if (chat && chat.unreadCount > 0) this.notifyChat({ ...chat, unreadCount: 0 });
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

  private ensureChat(id: string, peerJid: string, kind: Chat['kind'] = 'direct'): Chat {
    const existing = this.chats.get(id);
    if (existing) return existing;
    const chat: Chat = {
      id,
      kind,
      peerJid,
      title: peerJid.split('@')[0] ?? peerJid,
      unreadCount: 0,
      encrypted: false,
    };
    this.chats.set(id, chat);
    this.byChat.set(id, []);
    return chat;
  }

  private build(
    input: Partial<Message> & { chatId: string; fromJid: string; body: string },
  ): Message {
    this.counter += 1;
    return {
      id: `m${this.counter}`,
      sentAt: new Date(2026, 9, 15, 12, 0, this.counter),
      direction: 'in',
      status: 'delivered',
      encryption: 'none',
      attachments: [],
      reactions: [],
      isMention: false,
      retracted: false,
      edited: false,
      ...input,
    };
  }

  private append(chat: Chat, message: Message): void {
    this.byChat.get(chat.id)?.push(message);
    const counts = message.direction === 'in' && chat.id !== this.openId;
    const unread = counts ? chat.unreadCount + 1 : chat.unreadCount;
    this.notifyChat({ ...chat, lastMessage: message, unreadCount: unread });
  }

  private notifyChat(chat: Chat): void {
    this.chats.set(chat.id, chat);
    for (const handler of this.chatHandlers) handler(chat);
  }
}
