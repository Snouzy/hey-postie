import type { DomainError } from './errors';
import type {
  AccountState,
  Chat,
  Contact,
  Message,
  Room,
  RoomInfo,
  RoomMember,
  RoomNotify,
} from './types';

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

/**
 * Group chats (XEP-0045). Messages of a room flow through `ChatRepository` with `chatId` = the
 * room's bare JID and `kind: 'room'`; the repository sets `isMention` and `fromNick`.
 */
export interface RoomRepository {
  /** Bookmarked and joined rooms. */
  list(): Promise<Room[]>;
  join(input: { jid: string; nick: string; password?: string }): Promise<Room>;
  leave(jid: string): Promise<void>;
  members(jid: string): Promise<RoomMember[]>;
  setNotify(jid: string, rule: RoomNotify): Promise<void>;
  setBookmarked(jid: string, bookmarked: boolean): Promise<void>;
  /** The rooms a server (or its conference component) lists publicly. */
  browse(domain: string): Promise<RoomInfo[]>;
  /** The conference service of a domain (disco, e.g. `rooms.example.org`), or null. */
  roomService(domain: string): Promise<string | null>;
  onChange(handler: (room: Room) => void): () => void;
  onMembersChange(handler: (jid: string, members: RoomMember[]) => void): () => void;
}

export interface Notifier {
  show(input: { title: string; body: string; chatId: string }): Promise<void>;
}
