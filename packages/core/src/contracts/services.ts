import type { EventBus } from './events';
import type {
  Account,
  Chat,
  Contact,
  Message,
  Room,
  RoomInfo,
  RoomMember,
  RoomNotify,
} from './types';

export interface AccountsService {
  current(): Account | null;
  signIn(input: { jid: string; password: string; remember: boolean }): Promise<Account>;
  signOut(): Promise<void>;
  rememberedPassword(jid: string): Promise<string | null>;
}

export interface ContactsService {
  list(): Promise<Contact[]>;
  /** Validates the JID, sends the subscription request. */
  add(input: { jid: string; name?: string }): Promise<Contact>;
  remove(jid: string): Promise<void>;
}

export interface ChatsService {
  /** Sorted by last activity, most recent first. */
  list(): Promise<Chat[]>;
  open(jid: string): Promise<Chat>;
  messages(chatId: string): Promise<Message[]>;
  /** Loads the page before the oldest message already loaded; returns it (oldest first). */
  loadOlder(chatId: string): Promise<Message[]>;
  /** Trims the body; refuses an empty one with `EmptyMessage`. */
  send(chatId: string, body: string): Promise<Message>;
  markRead(chatId: string): Promise<void>;
}

export interface RoomsService {
  list(): Promise<Room[]>;
  /** Validates the JID and the nick (non-empty, trimmed), joins, bookmarks on success. */
  join(input: { jid: string; nick: string; password?: string }): Promise<Room>;
  /** Leaves and removes the bookmark. */
  leave(jid: string): Promise<void>;
  members(jid: string): Promise<RoomMember[]>;
  setNotify(jid: string, rule: RoomNotify): Promise<void>;
  /** Lists the public rooms of a domain; the domain is validated like a JID's domain. */
  browse(domain: string): Promise<RoomInfo[]>;
}

/** Decides when a system notification is shown. The UI tells it what the user is looking at. */
export interface NotificationsService {
  setWindowFocused(focused: boolean): void;
  setOpenChat(chatId: string | null): void;
}

export interface Core {
  accounts: AccountsService;
  contacts: ContactsService;
  chats: ChatsService;
  rooms: RoomsService;
  notifications: NotificationsService;
  events: EventBus;
}
