import type { DomainError } from './errors';
import type {
  AccountState,
  Chat,
  Contact,
  Device,
  Message,
  RegistrationForm,
  Room,
  RoomInfo,
  RoomMember,
  RoomNotify,
  Trust,
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
  onChange(handler: (room: Room) => void): () => void;
  onMembersChange(handler: (jid: string, members: RoomMember[]) => void): () => void;
}

/**
 * End-to-end encryption (OMEMO, XEP-0384). The engine encrypts and decrypts; this repository
 * exposes the devices, their trust, and the per-chat switch.
 */
export interface CryptoRepository {
  /** The devices of a contact (or of a room's members), with their trust. */
  devices(jid: string): Promise<Device[]>;
  ownDevices(): Promise<Device[]>;
  ownDeviceId(): Promise<number>;
  setTrust(jid: string, deviceId: number, trust: Trust): Promise<void>;
  removeOwnDevice(deviceId: number): Promise<void>;
  /** True when every party of the chat has at least one usable device. */
  available(chatId: string): Promise<boolean>;
  setEncryption(chatId: string, enabled: boolean): Promise<void>;
  onDevicesChange(handler: (jid: string, devices: Device[]) => void): () => void;
}

/** In-band registration and account deletion (XEP-0077). Needs no signed-in account for `form`/`submit`. */
export interface RegistrationRepository {
  form(input: { domain: string; websocketUrl: string }): Promise<RegistrationForm>;
  /** `values` keyed by field name; resolves once the server confirms the account. */
  submit(input: {
    domain: string;
    websocketUrl: string;
    values: Record<string, string>;
  }): Promise<void>;
  /** Deletes the signed-in account on its server. */
  deleteCurrent(): Promise<void>;
  /** Removes every local trace of an account: engine stores, caches. Not the keychain. */
  wipeLocal(jid: string): Promise<void>;
}

export interface Notifier {
  show(input: { title: string; body: string; chatId: string }): Promise<void>;
}
