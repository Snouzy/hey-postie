import type { DomainError } from './errors';

export type AccountState = 'offline' | 'connecting' | 'online' | 'error';
export interface Account {
  jid: string;
  displayName: string;
  state: AccountState;
  error?: DomainError;
  /**
   * The presence the user chose through `AccountsService.setPresence`; absent until then (the
   * server's default: online, no sentence). Kept across reconnections and sent again.
   */
  presence?: AccountPresence;
  /** The account's own avatar (XEP-0084 or vCard), when the server has one. */
  avatarUrl?: string;
}

export type Presence = 'online' | 'away' | 'dnd' | 'offline';
/** What the user chooses to show; `offline` is not a choice, it is the result of signing out. */
export type PresenceShow = Exclude<Presence, 'offline'>;
export interface AccountPresence {
  show: PresenceShow;
  /** The status sentence, trimmed and bounded by the service; absent when empty. */
  status?: string;
}
export interface Contact {
  jid: string;
  name: string;
  avatarUrl?: string;
  presence: Presence;
  subscription: 'both' | 'to' | 'from' | 'none';
}

/**
 * A stranger asking to see our presence (an incoming subscription request, RFC 6121). Held until
 * the user accepts, ignores or blocks it: the repository lists it here, never in the roster.
 */
export interface ContactRequest {
  jid: string;
  name: string;
  /** The sentence the stranger attached to the request, sanitized by the service. */
  message?: string;
}

/** When a room's messages raise a system notification. Default: on mentions only. */
export type RoomNotify = 'all' | 'mentions' | 'none';

export interface Room {
  jid: string;
  name: string;
  nick: string;
  joined: boolean;
  bookmarked: boolean;
  topic?: string;
  notify: RoomNotify;
  unreadCount: number;
  mentionsCount: number;
  /** Private: members only, by invitation. Public: open and listed. Unknown until the room says. */
  visibility?: RoomVisibility;
  /** My standing in the hall. */
  affiliation?: RoomAffiliation;
}

export type RoomVisibility = 'private' | 'public';
export type RoomAffiliation = 'owner' | 'admin' | 'member' | 'outcast' | 'none';

/** What an owner sets on a hall (XEP-0045 room configuration). */
export interface RoomSettings {
  name: string;
  description: string;
  visibility: RoomVisibility;
}

/** Someone with a standing in a hall, present or not (owner, admin, member, banned). */
export interface RoomAffiliate {
  jid: string;
  nick?: string;
  affiliation: RoomAffiliation;
}

/** A person of a hall as the panel shows them: present now, or a member who is away. */
export interface RoomPerson {
  nick?: string;
  jid?: string;
  role?: RoomMember['role'];
  affiliation: RoomAffiliation;
  present: boolean;
}

/** An invitation to a hall, waiting for the user's answer. Untrusted text in `reason`. */
export interface RoomInvitation {
  roomJid: string;
  fromJid: string;
  reason?: string;
  password?: string;
}

export interface RoomMember {
  nick: string;
  /** Known only in non-anonymous rooms. */
  jid?: string;
  role: 'moderator' | 'participant' | 'visitor';
  affiliation: 'owner' | 'admin' | 'member' | 'none' | 'outcast';
}

/** A room found by browsing a server's room list. */
export interface RoomInfo {
  jid: string;
  name: string;
  membersCount?: number;
  description?: string;
}

export interface Chat {
  id: string;
  kind: 'direct' | 'room';
  peerJid: string;
  title: string;
  lastMessage?: Message;
  unreadCount: number;
  encrypted: boolean;
  /**
   * True when the peer of a direct chat is not in the roster: a message request (decision of
   * 2026-10-16). Set by `ChatsService` on every chat it returns or emits; rooms never have it.
   */
  fromStranger?: boolean;
  /**
   * True when the chat is a message request: `fromStranger`, they wrote, and this account never
   * wrote in it. A chat the user started, or answered, is an ordinary chat even with a stranger.
   * Set by `ChatsService` next to `fromStranger`; rooms never have it. "Never wrote" is read from
   * the most recent page of the history: a reply older than that page is not seen.
   */
  isRequest?: boolean;
  /**
   * The first letter that arrived unread (Converse's `first_unread_id`), present only while
   * `unreadCount` is above zero: the UI captures it when the chat opens, before marking it read,
   * to draw the "New" line above it.
   */
  firstUnreadId?: string;
}

/** XEP-0085: what the peer is doing in a chat, as far as the UI cares. */
export type ChatState = 'composing' | 'paused' | 'active';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type Encryption = 'none' | 'omemo' | 'undecryptable';

export interface Attachment {
  url: string;
  name: string;
  size: number;
  mimeType: string;
  thumbnailUrl?: string;
  encryption: 'none' | 'aesgcm';
  /** The `#iv+key` fragment of an `aesgcm://` URL, kept out of `url` so that the UI never shows it. */
  decryptionKey?: string;
  progress?: number;
}

export interface Reaction {
  emoji: string;
  fromJids: string[];
  /** True when this account reacted (in a room, under its occupant JID). Set by the repository. */
  mine: boolean;
}

/** XEP-0461: the letter a reply answers. Untrusted text in `excerpt`, like a body. */
export interface ReplyTo {
  /**
   * The original's `Message.id` when it is in the chat's loaded history (the UI can jump to it),
   * else the id the reply names on the wire.
   */
  id: string;
  /** Who wrote the original, as in `Message.fromJid`; unknown when the reply did not say. */
  fromJid?: string;
  /** The original's nick, in a hall. */
  fromNick?: string;
  /** The original is one of this account's letters. */
  mine?: boolean;
  /** The original's text, one line, bounded by the service; from the quoted fallback when not loaded. */
  excerpt?: string;
}

/**
 * XEP-0372: a hall member named in a letter. Offsets are UTF-16 indexes into `Message.body`
 * (`end` excluded); the text there is the nick, with or without its `@`.
 */
export interface Mention {
  begin: number;
  end: number;
  nick: string;
}

/**
 * A link preview a hall itself attached to a letter (Open Graph metadata fastened by the room's
 * own JID, Converse's `ogp_metadata`). Never fetched by the reader. Untrusted text, like a body.
 */
export interface LinkPreview {
  /** The page, `http(s)://` only. */
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  /** The page's picture, `https://` only; shown only where the sender's pictures load by themselves. */
  imageUrl?: string;
}

/** How a letter leaves (`ChatsService.send`). */
export interface SendOptions {
  /** The `Message.id` of the letter this one answers (XEP-0461). */
  replyTo?: string;
}

export interface Message {
  id: string;
  chatId: string;
  /**
   * Bare JID of the sender. In a room: the sender's real bare JID when the room reveals it,
   * otherwise `room@service/nick`, so that two occupants never share a `fromJid`.
   */
  fromJid: string;
  fromNick?: string;
  body: string;
  sentAt: Date;
  direction: 'in' | 'out';
  status: MessageStatus;
  encryption: Encryption;
  attachments: Attachment[];
  reactions: Reaction[];
  isMention: boolean;
  /**
   * XEP-0424: the sender took the message back, or (XEP-0425) a moderator removed it from a hall;
   * `body` and `attachments` are then empty.
   */
  retracted?: boolean;
  /** Who removed it, when `retracted`. */
  retractedBy?: 'sender' | 'moderator';
  /** The moderator's reason, when one was given. Untrusted text, like a body. */
  moderationReason?: string;
  /** XEP-0308: the body is a correction of an earlier version. */
  edited?: boolean;
  /** The earlier texts of a corrected letter, oldest first, as this device saw them. Untrusted. */
  versions?: { body: string; at: Date }[];
  /** XEP-0461: this letter answers another one; the quoted fallback is already out of `body`. */
  replyTo?: ReplyTo;
  /** XEP-0372 mentions in `body`, in order, never overlapping. Halls only. */
  mentions?: Mention[];
  /** XEP-0393: the sender asked for `body` to be shown as plain text (`<unstyled/>`). */
  unstyled?: boolean;
  /** Link previews the hall attached, in order, at most a few. Halls only. */
  linkPreviews?: LinkPreview[];
}

/** Where a `ConversationArchiveService` page stopped: pass it back for the next, older page. */
export interface ArchiveCursor {
  /** The `Message.id` of the oldest letter already looked at. */
  before: string;
}

/** Newest first. `next` is absent once the start of the conversation's archive is reached. */
export interface ArchivePage<T> {
  items: T[];
  next?: ArchiveCursor;
}

/** A letter a search found; `ranges` are the matches in `body` (empty when a file name matched). */
export interface SearchHit {
  message: Message;
  ranges: { start: number; end: number }[];
}

/** WhatsApp's "media, links and docs" of a conversation. */
export type ArchiveKind = 'media' | 'link' | 'document';

export type ArchiveItem =
  | { kind: 'media' | 'document'; message: Message; attachment: Attachment }
  /** An `http(s)` URL of a body, with the preview the hall attached to it, if any. */
  | { kind: 'link'; message: Message; url: string; preview?: LinkPreview };

export type Trust = 'untrusted' | 'trusted' | 'verified' | 'blocked';
export interface Device {
  jid: string;
  deviceId: number;
  fingerprint: string;
  trust: Trust;
  isOwn: boolean;
}

/** What a server asks for when creating an account in band (XEP-0077). */
export interface RegistrationField {
  /** `username` and `password` are always present; servers may add `email` or custom fields. */
  name: string;
  label: string;
  type: 'text' | 'password' | 'email' | 'hidden';
  required: boolean;
}

/**
 * Hidden fields and the form's own data (FORM_TYPE, CAPTCHA challenge) are kept by the repository
 * between `form` and `submit`: the UI only sends what the user typed.
 */
export interface RegistrationForm {
  domain: string;
  instructions?: string;
  fields: RegistrationField[];
  /** A CAPTCHA image when the server requires one (XEP-0158); `captchaField` names its answer. */
  captchaImageDataUrl?: string;
  captchaField?: string;
}
