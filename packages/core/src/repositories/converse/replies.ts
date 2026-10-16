import type { Mention, Message, ReplyTo } from '../../contracts/types';
import type { ChatModel, MessageModel, ModelLike } from './models';

/**
 * XEP-0461 replies and XEP-0372 mentions as Converse 14 stores them (wiki/development/converse.md,
 * "Replies and mentions"). Pure functions over models, unit-tested with plain `{ get }` objects.
 */

export const REPLY_NS = 'urn:xmpp:reply:0';

/** A stretch of a body cut out, in UTF-16 indexes (`end` excluded). */
interface Cut {
  begin: number;
  end: number;
}

/**
 * The text without the reply's quoted fallback (XEP-0428 `<fallback for=reply>`, offsets in code
 * points), the quote itself, and where it was. Converse strips it the same way in
 * `getMessageText` (`shared/message.js:196-203`), only when the message is a reply.
 */
export function withoutReplyFallback(
  model: ModelLike,
  text: string,
): { text: string; quote: string; cut: Cut | null } {
  const range = (model.get('fallback') as Record<string, unknown> | undefined)?.[REPLY_NS] as
    | { start?: unknown; end?: unknown }
    | null
    | undefined;
  const chars = [...text];
  const start = range?.start;
  const end = range?.end;
  const valid =
    Boolean(model.get('reply_to_id')) &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    (start as number) >= 0 &&
    (start as number) <= (end as number) &&
    (end as number) <= chars.length;
  if (!valid) return { text, quote: '', cut: null };
  const before = chars.slice(0, start as number).join('');
  const quote = chars.slice(start as number, end as number).join('');
  const after = chars.slice(end as number).join('');
  return {
    text: before + after,
    quote,
    cut: { begin: before.length, end: before.length + quote.length },
  };
}

/**
 * What the quoted fallback says of the original: its `> ` lines, without the `> name:` line
 * Converse puts first (`model-with-messages.js:308-346`), on one line.
 */
export function excerptFromQuote(quote: string): string {
  const lines = quote
    .split('\n')
    .filter((line) => line.startsWith('>'))
    .map((line) => line.replace(/^>\s?/, ''));
  if (lines.length > 1 && lines[0]?.endsWith(':')) lines.shift();
  return lines.join(' ').trim();
}

/**
 * The mentions of a message, from Converse's `references` (`{ begin, end, type, value }`, UTF-16
 * offsets into the body as sent, quote included): those in the quote go, those after it move back.
 */
export function mentionsOf(references: unknown, cut: Cut | null): Mention[] {
  if (!Array.isArray(references)) return [];
  const removed = cut ? cut.end - cut.begin : 0;
  const mentions: Mention[] = [];
  for (const reference of references as Array<Record<string, unknown>>) {
    const { begin, end, type, value } = reference;
    if (type !== 'mention' || typeof value !== 'string') continue;
    if (typeof begin !== 'number' || typeof end !== 'number') continue;
    const nick = value.replace(/^@/, '');
    if (!nick) continue;
    if (!cut || end <= cut.begin) mentions.push({ begin, end, nick });
    else if (begin >= cut.end) mentions.push({ begin: begin - removed, end: end - removed, nick });
  }
  return mentions.sort((a, b) => a.begin - b.begin);
}

/**
 * XEP-0461: the original when it is loaded (`map`ped, so its id is ours and the UI can jump to
 * it), else what the reply itself says: the id on the wire, the author's address, the quote.
 */
export function replyOf(
  model: ModelLike,
  quote: string,
  context: {
    chatId: string;
    ownNick?: string;
    replied?: (replyToId: string) => MessageModel | undefined;
  },
  map: (original: MessageModel) => Message,
): ReplyTo | undefined {
  const id = text(model.get('reply_to_id'));
  if (!id) return undefined;
  const loaded = context.replied?.(id);
  if (loaded) {
    const original = map(loaded);
    const reply: ReplyTo = { id: original.id, fromJid: original.fromJid };
    if (original.fromNick) reply.fromNick = original.fromNick;
    if (original.direction === 'out') reply.mine = true;
    const excerpt = original.body || original.attachments[0]?.name;
    if (excerpt) reply.excerpt = excerpt;
    return reply;
  }
  const reply: ReplyTo = { id };
  const to = text(model.get('reply_to'));
  const inRoom = context.ownNick !== undefined;
  if (to) {
    const bare = to.split('/')[0] ?? to;
    const nick = inRoom ? to.split('/')[1] : undefined;
    reply.fromJid = inRoom ? to : bare;
    if (nick) reply.fromNick = nick;
    // In a direct chat, an author who is not the peer is this account.
    if (inRoom ? nick === context.ownNick : bare !== context.chatId) reply.mine = true;
  }
  const excerpt = excerptFromQuote(quote);
  if (excerpt) reply.excerpt = excerpt;
  return reply;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The `<reply id to>` that names a letter of this chat (XEP-0461): in a hall the id the room
 * stamped (`stanza_id <room>`, as `getReferencedMessage` looks it up, `model-with-messages.js:289`)
 * and the author's occupant address; in a direct chat the letter's own id and its sender. A hall
 * letter without a room stamp cannot be named: null.
 */
export function replyAttributes(
  chat: ChatModel,
  original: MessageModel,
  room: boolean,
): { reply_to_id: string; reply_to: string } | null {
  const jid = String(chat.get('jid'));
  const id = room
    ? original.get(`stanza_id ${jid}`)
    : original.get('msgid') || original.get('origin_id');
  if (typeof id !== 'string' || !id) return null;
  const from = original.get('from');
  return { reply_to_id: id, reply_to: typeof from === 'string' && from ? from : jid };
}
