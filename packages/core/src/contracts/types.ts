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

export interface Room {
  jid: string;
  name: string;
  nick: string;
  joined: boolean;
  unreadCount: number;
  mentionsCount: number;
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
