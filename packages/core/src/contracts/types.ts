import type { DomainError } from './errors';

export type AccountState = 'offline' | 'connecting' | 'online' | 'error';
export interface Account {
  jid: string;
  displayName: string;
  state: AccountState;
  error?: DomainError;
}

export type Presence = 'online' | 'away' | 'dnd' | 'offline';
export interface Contact {
  jid: string;
  name: string;
  avatarUrl?: string;
  presence: Presence;
  subscription: 'both' | 'to' | 'from' | 'none';
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
}

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
  /** XEP-0424: the sender took the message back; `body` and `attachments` are then empty. */
  retracted?: boolean;
  /** XEP-0308: the body is a correction of an earlier version. */
  edited?: boolean;
}

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
