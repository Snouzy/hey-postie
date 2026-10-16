import type { EventBus } from './events';
import type {
  Account,
  AccountPresence,
  Attachment,
  Chat,
  Contact,
  ContactRequest,
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
  /**
   * Trims the status sentence, refuses one longer than `MAX_STATUS_LENGTH` (`StatusTooLong`),
   * drops an empty one. Needs an online account. Sent again after a reconnection.
   */
  setPresence(presence: AccountPresence): Promise<Account>;
}

/**
 * Message requests (decision of 2026-10-16): a stranger's subscription request waits in
 * `requests()`; their chats carry `Chat.fromStranger` and never raise a notification. Accepting
 * puts them in the roster; ignoring declines the request (they may ask again); blocking removes
 * them from the roster and the server drops everything they send (XEP-0191).
 */
export interface ContactsService {
  list(): Promise<Contact[]>;
  /** Validates the JID, sends the subscription request. */
  add(input: { jid: string; name?: string }): Promise<Contact>;
  remove(jid: string): Promise<void>;
  requests(): Promise<ContactRequest[]>;
  accept(jid: string): Promise<Contact>;
  ignore(jid: string): Promise<void>;
  block(jid: string): Promise<void>;
  unblock(jid: string): Promise<void>;
  /** The blocked bare JIDs (XEP-0191), sorted; `contacts.blocked` carries every change. */
  blocked(): Promise<string[]>;
}

export interface ChatsService {
  /** Sorted by last activity, most recent first. */
  list(): Promise<Chat[]>;
  open(jid: string): Promise<Chat>;
  messages(chatId: string): Promise<Message[]>;
  /** Loads the page before the oldest message already loaded; returns it (oldest first). */
  loadOlder(chatId: string): Promise<Message[]>;
  /**
   * A page of history that changes nothing in the open chat's paging (for Claude): the newest
   * messages, or those before `before`, oldest first, at most `limit` (`MESSAGE_PAGE_SIZE`).
   */
  history(chatId: string, options?: { before?: string; limit?: number }): Promise<Message[]>;
  /** Trims the body; refuses an empty one with `EmptyMessage`. */
  send(chatId: string, body: string): Promise<Message>;
  /** Toggles one emoji of this account on a message. */
  toggleReaction(chatId: string, messageId: string, emoji: string): Promise<void>;
  /**
   * Corrects one of the user's own sent letters (any of them, not only the last). The body is
   * trimmed; empty is `EmptyMessage`; someone else's, a retracted, a pending or a failed letter is
   * `NotAllowed`. An unchanged body changes nothing.
   */
  edit(chatId: string, messageId: string, body: string): Promise<Message>;
  /** Deletes one of the user's own letters for everyone (a request: some apps ignore it). */
  retract(chatId: string, messageId: string): Promise<void>;
  /** Hides a letter on this device only; it stays hidden after the history reloads. */
  hideForMe(chatId: string, messageId: string): Promise<void>;
  markRead(chatId: string): Promise<void>;
  /**
   * Call with `true` on every keystroke, `false` when the draft is cleared. The service sends
   * `composing` at most once per `COMPOSING_REPEAT_MS`, `paused` after `PAUSED_AFTER_MS` of
   * silence, and nothing extra when the message is sent (the message itself says `active`).
   */
  setComposing(chatId: string, composing: boolean): void;
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
  /** The conference service of the signed-in account's domain, discovered on the server, or null. */
  roomService(domain: string): Promise<string | null>;
  /**
   * Removes someone's letter from a hall, as a moderator only (`NotAllowed` otherwise). The
   * reason is trimmed, at most 140 characters (`StatusTooLong` past it).
   */
  moderate(jid: string, messageId: string, reason?: string): Promise<void>;
}

/**
 * Trust rules (spec 3.6): a new device is used but shown `untrusted` (blind trust before
 * verification); the user can mark it `verified` after comparing fingerprints, or `blocked`.
 */
export interface CryptoService {
  devices(jid: string): Promise<Device[]>;
  ownDevices(): Promise<Device[]>;
  /** The id of this device, to mark it in the list. */
  ownDeviceId(): Promise<number>;
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

export interface FilesService {
  /** Checks the size against the server's limit before uploading; progress 0..1. */
  send(chatId: string, file: File, onProgress?: (fraction: number) => void): Promise<Message>;
  maxFileSize(): Promise<number | null>;
  /** Bytes of an attachment, decrypted when needed; the UI makes an object URL from them. */
  fetch(attachment: Attachment): Promise<Blob>;
  /** True for images the UI may show inline (by media type and size). */
  isInlineImage(attachment: Attachment): boolean;
  /**
   * Whether the UI may fetch a message's attachments without a click: our own messages and those
   * of contacts in the roster. Anyone else could use a URL to learn when the chat is opened.
   */
  autoLoad(message: Message): Promise<boolean>;
}

/**
 * Decides when a system notification is shown, and what it says. The UI tells it what the user
 * is looking at, and whether the notification may carry the letter's text.
 */
export interface NotificationsService {
  setWindowFocused(focused: boolean): void;
  setOpenChat(chatId: string | null): void;
  /** Off: the body is a fixed sentence, never the message. On by default. */
  setShowPreview(value: boolean): void;
  getShowPreview(): boolean;
}

/**
 * Claude (MCP) access: off, read only, read and prepare drafts the user sends, or also send
 * directly (Claude's client asks the user before each send; Hey Postie does not).
 */
export type AssistantMode = 'off' | 'read' | 'readAndDraft' | 'readDraftAndSend';

export interface AssistantSettings {
  mode: AssistantMode;
  /** Sealed (OMEMO) chats stay out of every answer unless this is on. Off by default. */
  includeSealed: boolean;
  /** The loopback port of the MCP listener; client configs hold it, so it is fixed. */
  port: number;
}

/** A letter Claude prepared: it lands in the chat's composer, the user edits and sends it. */
export interface Draft {
  chatId: string;
  title: string;
  body: string;
}

/**
 * The rules of Claude's access (spec 2026-10-16-mcp-design). Off by default; what Claude reads
 * leaves the device. Claude prepares drafts the user reviews, edits and sends; it sends directly
 * only in the `readDraftAndSend` mode, the user confirming each send to Claude.
 */
export interface AssistantService {
  getSettings(): AssistantSettings;
  /** Applies at once and emits `assistant.changed`. Refuses a port outside 1024–65535 (`InvalidPort`). */
  setSettings(change: Partial<AssistantSettings>): AssistantSettings;
  /** The bearer token clients send, made and kept in the keychain the first time. */
  token(): Promise<string>;
  /** Replaces the token and emits `assistant.changed`: the old one stops working. */
  newToken(): Promise<string>;
  /** Whether Claude may see this chat at all (mode not off; sealed chats only when included). */
  canRead(chat: Chat): boolean;
  /**
   * Hands a draft to the interface (`assistant.draft`, then `chat.requested` to show the chat).
   * Refuses with `AssistantNotAllowed` unless the mode allows drafts. Nothing is sent.
   */
  draft(draft: Draft): void;
  /** Whether Claude may send directly (`readDraftAndSend`). */
  canSend(): boolean;
}

export interface Core {
  accounts: AccountsService;
  contacts: ContactsService;
  chats: ChatsService;
  rooms: RoomsService;
  crypto: CryptoService;
  files: FilesService;
  notifications: NotificationsService;
  assistant: AssistantService;
  events: EventBus;
}
