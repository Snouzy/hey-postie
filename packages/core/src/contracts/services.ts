import type { EventBus } from './events';
import type {
  Account,
  Chat,
  Contact,
  Device,
  Message,
  RegistrationForm,
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
  /** Asks a server what it needs to create an account; `RegistrationUnsupported` when it refuses. */
  registrationForm(domain: string): Promise<RegistrationForm>;
  /**
   * Creates the account then signs in and remembers the password. `AccountConflict` when the
   * name is taken, `RegistrationRejected` when the server refuses the values.
   */
  register(input: {
    domain: string;
    username: string;
    password: string;
    extra?: Record<string, string>;
  }): Promise<Account>;
  /** Deletes the signed-in account on the server, wipes its local data, signs out. */
  deleteAccount(): Promise<void>;
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

/**
 * Trust rules (spec 3.6): a new device is used but shown `untrusted` (blind trust before
 * verification); the user can mark it `verified` after comparing fingerprints, or `blocked`.
 */
export interface CryptoService {
  devices(jid: string): Promise<Device[]>;
  ownDevices(): Promise<Device[]>;
  verify(jid: string, deviceId: number): Promise<void>;
  block(jid: string, deviceId: number): Promise<void>;
  /** Back to the blind-trust state. */
  unblock(jid: string, deviceId: number): Promise<void>;
  removeOwnDevice(deviceId: number): Promise<void>;
  available(chatId: string): Promise<boolean>;
  /** Refuses with `EncryptionUnavailable` when the other side has no device. */
  setEncryption(chatId: string, enabled: boolean): Promise<void>;
  /** A fingerprint as the user compares it: groups of 8 hex characters. */
  formatFingerprint(fingerprint: string): string;
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
  crypto: CryptoService;
  notifications: NotificationsService;
  events: EventBus;
}
