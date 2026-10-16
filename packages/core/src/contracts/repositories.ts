import type { DomainError } from './errors';
import type {
  AccountPresence,
  AccountState,
  Attachment,
  Chat,
  ChatState,
  Contact,
  ContactRequest,
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
  /** Sends this account's presence: `<show>` from `show` (none for online), `<status>` from `status`. */
  setPresence(presence: AccountPresence): Promise<void>;
  /** The account's own avatar changed (XEP-0084 or vCard); `undefined` when it was removed. */
  onAvatarChange(handler: (avatarUrl: string | undefined) => void): () => void;
}

/**
 * The roster (RFC 6121) and the blocklist (XEP-0191). `list()` holds the contacts the user added
 * or accepted; a stranger's pending subscription request is in `requests()` only.
 */
export interface RosterRepository {
  list(): Promise<Contact[]>;
  add(jid: string, name?: string): Promise<Contact>;
  remove(jid: string): Promise<void>;
  /** Fires for presence, name or subscription changes, and for additions and removals. */
  onChange(handler: (contact: Contact) => void): () => void;
  requests(): Promise<ContactRequest[]>;
  /** Approves the request (`subscribed`), adds the JID to the roster and subscribes back. */
  accept(jid: string): Promise<Contact>;
  /** Refuses the request (`unsubscribed`); the peer may ask again later. */
  decline(jid: string): Promise<void>;
  /** Adds the JID to the blocklist (XEP-0191) and drops its pending request, if any. */
  block(jid: string): Promise<void>;
  unblock(jid: string): Promise<void>;
  /** The blocklist (XEP-0191): bare JIDs, as the server holds them. */
  blocked(): Promise<string[]>;
  /** Fires with the whole blocklist after a block or an unblock, ours or from another device. */
  onBlockedChange(handler: (jids: string[]) => void): () => void;
  onRequest(handler: (request: ContactRequest) => void): () => void;
}

export interface ChatRepository {
  /** The bare JID of the signed-in account, as it appears in `Reaction.fromJids`. */
  selfJid(): string;
  list(): Promise<Chat[]>;
  /** Opens (or creates) the direct chat with a bare JID. */
  open(jid: string): Promise<Chat>;
  /** One message by id, wherever it is in the history; null when unknown. */
  message(chatId: string, messageId: string): Promise<Message | null>;
  /** The most recent messages, oldest first. `before` asks for the page that precedes a message id. */
  messages(chatId: string, options?: { before?: string; limit?: number }): Promise<Message[]>;
  send(chatId: string, body: string): Promise<Message>;
  /**
   * Uploads a file (XEP-0363; encrypted with AES-GCM when the chat is sealed) and sends the
   * message that carries it. `onProgress` gets 0..1. Rejects with `FileTooLarge` when the server's
   * limit is known and exceeded.
   */
  sendFile(chatId: string, file: File, onProgress?: (fraction: number) => void): Promise<Message>;
  /** The server's upload limit in bytes, when it announces one. */
  maxFileSize(): Promise<number | null>;
  /** Sets this account's reactions on a message (XEP-0444); an empty list removes them all. */
  react(chatId: string, messageId: string, emojis: string[]): Promise<void>;
  /** Replaces the body of one of our messages (XEP-0308); sealed when the message was. */
  correct(chatId: string, messageId: string, body: string): Promise<Message>;
  /** Takes one of our messages back (XEP-0424). `NotRetractable` when it cannot be addressed. */
  retract(chatId: string, messageId: string): Promise<void>;
  markRead(chatId: string): Promise<void>;
  /** Sends our chat state (XEP-0085): `composing` when true, `paused` when false. */
  setComposing(chatId: string, composing: boolean): Promise<void>;
  onMessage(handler: (message: Message) => void): () => void;
  onMessageUpdate(handler: (message: Message) => void): () => void;
  onChatChange(handler: (chat: Chat) => void): () => void;
  /** A peer's chat state (XEP-0085); `fromJid` is a bare JID, or `room@service/nick` in a room. */
  onChatState(handler: (chatId: string, fromJid: string, state: ChatState) => void): () => void;
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
  /** Removes someone's message from the hall as a moderator (XEP-0425); the server enforces it. */
  moderate(jid: string, messageId: string, reason?: string): Promise<void>;
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

/** Fetches attachments (and decrypts `aesgcm` ones) for display and saving. */
export interface FileRepository {
  /** The bytes of an attachment, decrypted when it has a `decryptionKey`. Cached by URL. */
  fetch(attachment: Attachment): Promise<Blob>;
}

export interface Notifier {
  show(input: { title: string; body: string; chatId: string }): Promise<void>;
}

/**
 * The messages the user hid on this device ("delete for me"): kept per account so that the
 * server's history (MAM) cannot bring them back. Nothing is sent anywhere.
 */
export interface HiddenMessagesRepository {
  list(account: string): Promise<string[]>;
  add(account: string, messageId: string): Promise<void>;
}
