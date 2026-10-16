import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { ChatsService } from '../contracts/services';
import type { Chat, Contact, Message, Reaction } from '../contracts/types';
import { isStranger } from './contacts';
import { normalizeJid } from './jid';
import { stripControlCharacters } from './text';
import { createTypingTracker } from './typing';

/** The size of a page of history: a first page shorter than this is the whole history. */
export const MESSAGE_PAGE_SIZE = 50;

export function createChatsService(
  deps: Pick<CoreDependencies, 'chat' | 'roster' | 'hidden'>,
  events: EventBus,
): ChatsService {
  /** The oldest message id loaded per chat, for `loadOlder`. */
  const oldest = new Map<string, string>();
  const pending = new Map<string, Promise<void>>();
  const typing = createTypingTracker(deps.chat);
  /** The chats this account wrote in, as seen in the history, in `send` or in an echoed message. */
  const written = new Set<string>();
  /** Chat updates are emitted in the order they arrive, even though each one asks the roster. */
  let updates: Promise<void> = Promise.resolve();

  const noteWritten = (messages: Message[]): void => {
    for (const message of messages) if (message.direction === 'out') written.add(message.chatId);
  };

  /**
   * The rule behind `Chat.isRequest`: they wrote and this account never did. "Never" is read from
   * the most recent page of the history, so a reply older than that page is not seen.
   */
  const unanswered = async (chat: Chat): Promise<boolean> => {
    if (!chat.lastMessage || written.has(chat.id)) return false;
    noteWritten([chat.lastMessage]);
    if (written.has(chat.id)) return false;
    noteWritten(await deps.chat.messages(chat.id, { limit: MESSAGE_PAGE_SIZE }));
    return !written.has(chat.id);
  };

  /** Marks a direct chat with a stranger (see `isStranger`); a room is returned as is. */
  const flag = async (contacts: Contact[], chat: Chat): Promise<Chat> => {
    if (chat.kind !== 'direct') return chat;
    const fromStranger = isStranger(contacts, chat);
    const isRequest = fromStranger && (await unanswered(chat));
    return { ...chat, fromStranger, isRequest };
  };

  deps.chat.onMessage((message) => {
    noteWritten([message]);
    events.emit('message.received', sanitize(message));
  });
  deps.chat.onMessageUpdate((message) => events.emit('message.updated', sanitize(message)));
  deps.chat.onChatChange((chat) => {
    updates = updates
      .then(async () => events.emit('chat.updated', await flag(await deps.roster.list(), chat)))
      .catch(() => undefined);
  });
  deps.chat.onChatState((chatId, fromJid, state) =>
    events.emit('chat.typing', { chatId, fromJid, typing: state === 'composing' }),
  );

  /** The letters hidden on this device ("delete for me"), for the signed-in account. */
  const hiddenIds = async () => new Set(await deps.hidden.list(deps.chat.selfJid()));
  const visible = async (messages: Message[]) => {
    const hidden = await hiddenIds();
    return messages.filter((message) => !hidden.has(message.id));
  };

  /** One of the user's own sent letters, still there: what edit and delete for everyone need. */
  const ownSent = async (chatId: string, messageId: string): Promise<Message> => {
    const message = await deps.chat.message(chatId, messageId);
    if (!message) throw new DomainError('Unknown', 'Unknown: no such message');
    const usable = message.direction === 'out' && !message.retracted;
    const settled = message.status !== 'pending' && message.status !== 'failed';
    if (!usable || !settled)
      throw new DomainError('NotAllowed', 'NotAllowed: not a sent letter of ours');
    return message;
  };

  return {
    async list() {
      const [chats, contacts] = await Promise.all([deps.chat.list(), deps.roster.list()]);
      const flagged = await Promise.all(chats.map((chat) => flag(contacts, chat)));
      return flagged.sort((a, b) => time(b.lastMessage) - time(a.lastMessage));
    },
    async open(jid) {
      const chat = await deps.chat.open(normalizeJid(jid).split('/')[0] ?? '');
      return flag(await deps.roster.list(), chat);
    },
    async messages(chatId) {
      const messages = (await deps.chat.messages(chatId, { limit: MESSAGE_PAGE_SIZE })).map(
        sanitize,
      );
      noteWritten(messages);
      remember(oldest, chatId, messages);
      return visible(messages);
    },
    async loadOlder(chatId) {
      const before = oldest.get(chatId);
      if (!before) return [];
      const messages = (await deps.chat.messages(chatId, { before, limit: MESSAGE_PAGE_SIZE })).map(
        sanitize,
      );
      noteWritten(messages);
      remember(oldest, chatId, messages);
      return visible(messages);
    },
    async history(chatId, options = {}) {
      const limit = Math.min(Math.max(1, options.limit ?? MESSAGE_PAGE_SIZE), MESSAGE_PAGE_SIZE);
      const page = options.before ? { before: options.before, limit } : { limit };
      return visible((await deps.chat.messages(chatId, page)).map(sanitize));
    },
    async send(chatId, body) {
      const trimmed = body.trim();
      if (!trimmed) throw new DomainError('EmptyMessage');
      typing.sent(chatId);
      written.add(chatId);
      const sent = await deps.chat.send(chatId, trimmed);
      // The repository reports no echo of our own letters: every listener (the open chat, the
      // smoke driver) learns of one here, whoever asked for the send.
      events.emit('message.received', sent);
      return sent;
    },
    async toggleReaction(chatId, messageId, emoji) {
      const trimmed = emoji.trim();
      if (!trimmed) throw new DomainError('EmptyMessage');
      // One write at a time per message, so two quick taps compose instead of racing.
      const key = `${chatId}\u0000${messageId}`;
      const run = (pending.get(key) ?? Promise.resolve()).then(async () => {
        const message = await deps.chat.message(chatId, messageId);
        if (!message) throw new DomainError('Unknown', 'Unknown: no such message');
        const mine = new Set(message.reactions.filter((r) => r.mine).map((r) => r.emoji));
        if (mine.has(trimmed)) mine.delete(trimmed);
        else mine.add(trimmed);
        await deps.chat.react(chatId, messageId, [...mine]);
      });
      pending.set(
        key,
        run.catch(() => undefined),
      );
      return run;
    },
    async edit(chatId, messageId, body) {
      const trimmed = body.trim();
      if (!trimmed) throw new DomainError('EmptyMessage');
      const message = await ownSent(chatId, messageId);
      if (message.body === trimmed) return message;
      const corrected = sanitize(await deps.chat.correct(chatId, messageId, trimmed));
      events.emit('message.updated', corrected);
      return corrected;
    },
    async retract(chatId, messageId) {
      const message = await ownSent(chatId, messageId);
      await deps.chat.retract(chatId, messageId);
      events.emit('message.updated', {
        ...message,
        body: '',
        attachments: [],
        retracted: true,
        retractedBy: 'sender',
      });
    },
    async hideForMe(chatId, messageId) {
      await deps.hidden.add(deps.chat.selfJid(), messageId);
      events.emit('message.hidden', { chatId, messageId });
    },
    markRead(chatId) {
      return deps.chat.markRead(chatId);
    },
    setComposing(chatId, composing) {
      if (composing) typing.keystroke(chatId);
      else typing.cleared(chatId);
    },
  };
}

/** Incoming text is untrusted: the UI renders it as text, never as HTML. Control characters go. */
export function sanitize(message: Message): Message {
  const body = stripControlCharacters(message.body);
  const reactions = sanitizeReactions(message.reactions);
  const versions = message.versions?.map((version) => ({
    ...version,
    body: stripControlCharacters(version.body),
  }));
  const same = body === message.body && reactions === message.reactions && !versions;
  return same ? message : { ...message, body, reactions, ...(versions ? { versions } : {}) };
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
