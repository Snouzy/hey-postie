import type {
  Attachment,
  Chat,
  Contact,
  Message,
  MessageStatus,
  Presence,
  Reaction,
} from '../../contracts/types';
import type { ChatModel, ContactModel, MessageModel, ModelLike } from './models';

/** Pure mappings from Converse models to the contract types. Attribute names: converse.md §3-4. */

export interface MessageContext {
  chatId: string;
  /** Converse has no "sent" flag: a message is pending only while the connection is not authenticated. */
  authenticated: boolean;
  /** The chat's `num_unread`: 0 means every incoming message was seen. */
  unread: number;
}

export function toMessage(model: MessageModel, context: MessageContext): Message {
  const direction = model.get('sender') === 'me' ? 'out' : 'in';
  const undecryptable = model.get('error_type') === 'Decryption';
  const retracted = Boolean(model.get('retracted'));
  const body =
    undecryptable || retracted ? '' : string(model.get('plaintext')) || string(model.get('body'));
  const message: Message = {
    id: string(model.get('id')),
    chatId: context.chatId,
    fromJid: bareJid(string(model.get('from'))),
    body,
    sentAt: new Date(string(model.get('time'))),
    direction,
    status: status(model, direction, context),
    encryption: undecryptable ? 'undecryptable' : model.get('is_encrypted') ? 'omemo' : 'none',
    attachments: retracted ? [] : attachments(string(model.get('oob_url')), body),
    reactions: reactions(model.get('reactions')),
    isMention: false,
    retracted,
    edited: Boolean(model.get('edited')),
  };
  const nick = model.get('nick');
  return typeof nick === 'string' && nick ? { ...message, fromNick: nick } : message;
}

export function toChat(model: ChatModel, lastMessage?: Message): Chat {
  const jid = string(model.get('jid'));
  const chat: Chat = {
    id: jid,
    kind: 'direct',
    peerJid: jid,
    title: displayName(model.getDisplayName(), jid),
    unreadCount: number(model.get('num_unread')),
    encrypted: Boolean(model.get('omemo_active')),
  };
  return lastMessage ? { ...chat, lastMessage } : chat;
}

export function toContact(model: ContactModel): Contact {
  const jid = string(model.get('jid'));
  return {
    jid,
    name: displayName(model.getDisplayName(), jid),
    presence: presence(model.getStatus()),
    subscription: subscription(model.get('subscription')),
  };
}

function status(model: ModelLike, direction: 'in' | 'out', context: MessageContext): MessageStatus {
  if (model.get('is_error') && model.get('error_type') !== 'Decryption') return 'failed';
  if (direction === 'in') return context.unread === 0 ? 'read' : 'delivered';
  // `received` is only set on our own messages when a XEP-0184 receipt arrives (§4).
  if (model.get('received')) return 'delivered';
  return context.authenticated ? 'sent' : 'pending';
}

/**
 * A file is an XEP-0066 `oob_url` (http or https), or a body that is nothing but an `aesgcm://`
 * URL (§7: an encrypted upload has no `oob_url`). A plain link in a body stays a link.
 */
function attachments(oobUrl: string, body: string): Attachment[] {
  if (/^https?:\/\/\S+$/i.test(oobUrl)) return [attachment(oobUrl)];
  if (/^aesgcm:\/\/\S+$/i.test(body)) return [attachment(body)];
  return [];
}

function attachment(url: string): Attachment {
  const encrypted = url.toLowerCase().startsWith('aesgcm://');
  const [location = '', fragment] = url.split('#', 2);
  const path = location.replace(/^[a-z]+:\/\//i, '').split('?')[0] ?? '';
  const name = decodeName(path.split('/').pop() || 'file');
  const base: Attachment = {
    url: encrypted ? location : url,
    name,
    size: 0,
    mimeType: mimeType(name),
    encryption: encrypted ? 'aesgcm' : 'none',
  };
  return encrypted && fragment ? { ...base, decryptionKey: fragment } : base;
}

/** A malformed escape (`%E0`) must not take the whole chat list down with it. */
function decodeName(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
  txt: 'text/plain',
};

function mimeType(name: string): string {
  const extension = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/** Converse stores `{ senderBareJid: emojis[] }` (§6); the contract groups by emoji. */
function reactions(value: unknown): Reaction[] {
  if (!value || typeof value !== 'object') return [];
  const byEmoji = new Map<string, string[]>();
  for (const [jid, emojis] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(emojis)) continue;
    for (const emoji of emojis) {
      if (typeof emoji !== 'string') continue;
      const jids = byEmoji.get(emoji) ?? [];
      jids.push(jid);
      byEmoji.set(emoji, jids);
    }
  }
  return [...byEmoji].map(([emoji, fromJids]) => ({ emoji, fromJids }));
}

function presence(status: string): Presence {
  if (status === 'online' || status === 'chat') return 'online';
  if (status === 'away' || status === 'xa') return 'away';
  if (status === 'dnd') return 'dnd';
  return 'offline';
}

function subscription(value: unknown): Contact['subscription'] {
  return value === 'both' || value === 'to' || value === 'from' ? value : 'none';
}

export function bareJid(jid: string): string {
  return jid.split('/')[0] ?? jid;
}

/** `getDisplayName()` falls back to the JID itself when there is no nickname and no vCard. */
function displayName(name: string | null | undefined, jid: string): string {
  return name && name !== jid ? name : jid.split('@')[0] || jid;
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
