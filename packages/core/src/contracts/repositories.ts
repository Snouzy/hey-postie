import type { DomainError } from './errors';
import type { AccountState, Chat, Contact, Message } from './types';

export interface KeychainRepository {
  get(jid: string): Promise<string | null>;
  set(jid: string, password: string): Promise<void>;
  delete(jid: string): Promise<void>;
}

export interface TransportRepository {
  websocketUrlFor(domain: string): Promise<string>;
}

/** The connection itself. Milestone 1 adds the roster and the chats as separate repositories. */
export interface XmppRepository {
  connect(input: { jid: string; password: string; websocketUrl: string }): Promise<void>;
  disconnect(): Promise<void>;
  onStateChange(handler: (state: AccountState, error?: DomainError) => void): () => void;
}

export interface RosterRepository {
  list(): Promise<Contact[]>;
  add(jid: string, name?: string): Promise<Contact>;
  remove(jid: string): Promise<void>;
  /** Fires for presence, name or subscription changes, and for additions and removals. */
  onChange(handler: (contact: Contact) => void): () => void;
}

export interface ChatRepository {
  list(): Promise<Chat[]>;
  /** Opens (or creates) the direct chat with a bare JID. */
  open(jid: string): Promise<Chat>;
  /** The most recent messages, oldest first. `before` asks for the page that precedes a message id. */
  messages(chatId: string, options?: { before?: string; limit?: number }): Promise<Message[]>;
  send(chatId: string, body: string): Promise<Message>;
  markRead(chatId: string): Promise<void>;
  onMessage(handler: (message: Message) => void): () => void;
  onMessageUpdate(handler: (message: Message) => void): () => void;
  onChatChange(handler: (chat: Chat) => void): () => void;
}

export interface Notifier {
  show(input: { title: string; body: string; chatId: string }): Promise<void>;
}
