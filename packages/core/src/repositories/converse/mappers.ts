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
  /** Our nick in the room the message belongs to; absent for direct chats. */
  ownNick?: string;
  /**
   * The key of our own reactions on this chat's messages (`u.reactions.getOwnReactionJID`): our bare
   * JID in a direct chat, our occupant id or `room@service/nick` in a room. Unknown → nothing is `mine`.
   */
  ownReactionJid?: string;
}

export function toMessage(model: MessageModel, context: MessageContext): Message {
  const direction = model.get('sender') === 'me' ? 'out' : 'in';
  const undecryptable = model.get('error_type') === 'Decryption';
  const moderated = model.get('moderated') === 'retracted';
  const retracted = Boolean(model.get('retracted')) || moderated;
  const text =
    undecryptable || retracted ? '' : string(model.get('plaintext')) || string(model.get('body'));
  const files = retracted ? [] : attachments(string(model.get('oob_url')), text);
  const nick = string(model.get('nick'));
  const message: Message = {
    id: string(model.get('id')),
    chatId: context.chatId,
    fromJid: fromJid(model, context),
    // An upload's body is nothing but its URL (§7): the attachment carries it, the body is empty.
    body: files.length > 0 && isOnlyUrl(text) ? '' : text,
    sentAt: new Date(string(model.get('time'))),
    direction,
    status: status(model, direction, context),
    encryption: undecryptable ? 'undecryptable' : model.get('is_encrypted') ? 'omemo' : 'none',
    attachments: files,
    reactions: reactions(model.get('reactions'), context.ownReactionJid),
    isMention:
      direction === 'in' && Boolean(context.ownNick) && isMention(model, context.ownNick ?? ''),
    retracted,
    edited: Boolean(model.get('edited')),
  };
  if (retracted) message.retractedBy = moderated ? 'moderator' : 'sender';
  const versions = earlierVersions(model.get('older_versions'));
  if (message.edited && !retracted && versions.length > 0) message.versions = versions;
  const reason = string(model.get('moderation_reason'));
  if (moderated && reason) message.moderationReason = reason;
  return nick ? { ...message, fromNick: nick } : message;
}

/**
 * In a room `from` is `room@service/nick` and the real JID is only known when the room reveals it
 * (`from_real_jid`): the full occupant address is kept otherwise, so that two occupants never
 * share a `fromJid` (contracts/types.ts).
 */
function fromJid(model: MessageModel, context: MessageContext): string {
  const real = string(model.get('from_real_jid'));
  if (real) return bareJid(real);
  const from = string(model.get('from'));
  return context.ownNick === undefined ? bareJid(from) : from;
}

/** `CHATROOMS_TYPE` (`shared/constants.js:67`): a room counts every message in `num_unread_general`. */
export function toChat(model: ChatModel, lastMessage?: Message): Chat {
  const jid = string(model.get('jid'));
  const room = isRoom(model);
  const chat: Chat = {
    id: jid,
    kind: room ? 'room' : 'direct',
    peerJid: jid,
    title: displayName(model.getDisplayName(), jid),
    unreadCount: number(model.get(room ? 'num_unread_general' : 'num_unread')),
    encrypted: Boolean(model.get('omemo_active')),
  };
  return lastMessage ? { ...chat, lastMessage } : chat;
}

export function isRoom(model: ModelLike): boolean {
  return model.get('type') === 'chatroom';
}

/**
 * Converse's own rule (`plugins/muc/muc.js` `isUserMentioned`), made case-insensitive: when the
 * message carries XEP-0372 references, one of them must be a mention of our nick; otherwise the
 * nick must appear as a whole word in the body.
 */
export function isMention(model: ModelLike, ownNick: string): boolean {
  if (!ownNick) return false;
  const references = model.get('references');
  if (Array.isArray(references) && references.length > 0) {
    return references.some(
      (reference: { type?: unknown; value?: unknown }) =>
        reference.type === 'mention' &&
        typeof reference.value === 'string' &&
        reference.value.toLowerCase() === ownNick.toLowerCase(),
    );
  }
  const escaped = ownNick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(
    string(model.get('body')),
  );
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

function isOnlyUrl(text: string): boolean {
  return /^(https?|aesgcm):\/\/\S+$/i.test(text.trim());
}

function attachment(url: string): Attachment {
  const encrypted = url.toLowerCase().startsWith('aesgcm://');
  const [location = '', fragment] = url.split('#', 2);
  const path = location.replace(/^[a-z]+:\/\//i, '').split('?')[0] ?? '';
  const name = safeName(decodeName(path.split('/').pop() ?? ''));
  const base: Attachment = {
    url: encrypted ? location : url,
    name,
    size: 0,
    mimeType: mimeType(name),
    encryption: encrypted ? 'aesgcm' : 'none',
  };
  return encrypted && fragment ? { ...base, decryptionKey: fragment } : base;
}

const NAME_MAX_LENGTH = 120;

/**
 * The name comes from a URL someone else chose: it is shown and used as a download file name, so
 * path separators, control characters and leading dots go, and it stays short.
 */
function safeName(raw: string): string {
  const cleaned = raw
    // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
    .replace(/[\u0000-\u001F\u007F/\\]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, NAME_MAX_LENGTH);
  return cleaned || 'file';
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

/**
 * Converse stores `{ senderKey: emojis[] }` (§6; the key is a bare JID in a direct chat, an
 * occupant id or address in a room); the contract groups by emoji, sorted so that two updates
 * of the same message compare equal.
 */
function reactions(value: unknown, ownKey: string | undefined): Reaction[] {
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
  return [...byEmoji]
    .map(([emoji, fromJids]) => ({
      emoji,
      fromJids,
      mine: ownKey !== undefined && fromJids.includes(ownKey),
    }))
    .sort((a, b) => a.emoji.localeCompare(b.emoji));
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
export function displayName(name: string | null | undefined, jid: string): string {
  return name && name !== jid ? name : jid.split('@')[0] || jid;
}

export function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Converse keeps the texts a correction replaced as `older_versions`: the time each one was
 * written → its text (`model-with-messages.js:239-255`). Oldest first; anything odd is skipped.
 */
function earlierVersions(value: unknown): { body: string; at: Date }[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([time, body]) => ({ body, at: new Date(time) }))
    .filter((version) => !Number.isNaN(version.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
