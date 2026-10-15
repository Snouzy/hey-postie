import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { ChatsService } from '../contracts/services';
import type { Message } from '../contracts/types';
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
    markRead(chatId) {
      return deps.chat.markRead(chatId);
    },
  };
}

/** Incoming text is untrusted: the UI renders it as text, never as HTML. Control characters go. */
export function sanitize(message: Message): Message {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
  const body = message.body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return body === message.body ? message : { ...message, body };
}

function remember(oldest: Map<string, string>, chatId: string, messages: Message[]) {
  const first = messages[0];
  if (first) oldest.set(chatId, first.id);
}

function time(message: Message | undefined): number {
  return message ? message.sentAt.getTime() : 0;
}
