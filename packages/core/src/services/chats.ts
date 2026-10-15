import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { ChatsService } from '../contracts/services';
import type { Message, Reaction } from '../contracts/types';
import { normalizeJid } from './jid';

const PAGE_SIZE = 50;

export function createChatsService(
  deps: Pick<CoreDependencies, 'chat'>,
  events: EventBus,
): ChatsService {
  /** The oldest message id loaded per chat, for `loadOlder`. */
  const oldest = new Map<string, string>();

  deps.chat.onMessage((message) => events.emit('message.received', sanitize(message)));
  deps.chat.onMessageUpdate((message) => events.emit('message.updated', sanitize(message)));
  deps.chat.onChatChange((chat) => events.emit('chat.updated', chat));

  return {
    async list() {
      const chats = await deps.chat.list();
      return chats.sort((a, b) => time(b.lastMessage) - time(a.lastMessage));
    },
    open(jid) {
      return deps.chat.open(normalizeJid(jid).split('/')[0] ?? '');
    },
    async messages(chatId) {
      const messages = (await deps.chat.messages(chatId, { limit: PAGE_SIZE })).map(sanitize);
      remember(oldest, chatId, messages);
      return messages;
    },
    async loadOlder(chatId) {
      const before = oldest.get(chatId);
      if (!before) return [];
      const messages = (await deps.chat.messages(chatId, { before, limit: PAGE_SIZE })).map(
        sanitize,
      );
      remember(oldest, chatId, messages);
      return messages;
    },
    async send(chatId, body) {
      const trimmed = body.trim();
      if (!trimmed) throw new DomainError('EmptyMessage');
      return deps.chat.send(chatId, trimmed);
    },
    async toggleReaction(chatId, messageId, emoji) {
      const trimmed = emoji.trim();
      if (!trimmed) throw new DomainError('EmptyMessage');
      const message = (await deps.chat.messages(chatId, { limit: PAGE_SIZE })).find(
        (m) => m.id === messageId,
      );
      const mine = new Set((message?.reactions ?? []).filter((r) => r.mine).map((r) => r.emoji));
      if (mine.has(trimmed)) mine.delete(trimmed);
      else mine.add(trimmed);
      await deps.chat.react(chatId, messageId, [...mine]);
    },
    markRead(chatId) {
      return deps.chat.markRead(chatId);
    },
  };
}

/** Incoming text is untrusted: the UI renders it as text, never as HTML. Control characters go. */
export function sanitize(message: Message): Message {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
  const body = message.body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  const reactions = sanitizeReactions(message.reactions);
  return body === message.body && reactions === message.reactions
    ? message
    : { ...message, body, reactions };
}

const MAX_REACTIONS = 32;
const MAX_REACTORS = 64;
const MAX_EMOJI_LENGTH = 16;

/** Reactions come from peers: one short emoji each, no duplicates, bounded counts. */
export function sanitizeReactions(reactions: Reaction[]): Reaction[] {
  const seen = new Map<string, Reaction>();
  for (const reaction of reactions) {
    const emoji = reaction.emoji.trim();
    if (!emoji || emoji.length > MAX_EMOJI_LENGTH || /\s/.test(emoji)) continue;
    const existing = seen.get(emoji);
    const fromJids = [...new Set([...(existing?.fromJids ?? []), ...reaction.fromJids])].slice(
      0,
      MAX_REACTORS,
    );
    seen.set(emoji, { emoji, fromJids, mine: Boolean(existing?.mine) || reaction.mine });
    if (seen.size >= MAX_REACTIONS) break;
  }
  const clean = [...seen.values()];
  const unchanged =
    clean.length === reactions.length &&
    clean.every((r, i) => r === reactions[i] || sameReaction(r, reactions[i]));
  return unchanged ? reactions : clean;
}

function sameReaction(a: Reaction, b: Reaction | undefined): boolean {
  return (
    b !== undefined &&
    a.emoji === b.emoji &&
    a.mine === b.mine &&
    a.fromJids.length === b.fromJids.length &&
    a.fromJids.every((j, i) => j === b.fromJids[i])
  );
}

function remember(oldest: Map<string, string>, chatId: string, messages: Message[]) {
  const first = messages[0];
  if (first) oldest.set(chatId, first.id);
}

function time(message: Message | undefined): number {
  return message ? message.sentAt.getTime() : 0;
}
