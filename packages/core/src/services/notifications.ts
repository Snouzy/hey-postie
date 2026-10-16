import type { CoreDependencies } from '../container';
import type { EventBus } from '../contracts/events';
import type { NotificationsService } from '../contracts/services';
import type { Message, Room } from '../contracts/types';
import { isStranger } from './contacts';

/**
 * Shows a system notification for an incoming message unless the user is already looking at it:
 * window focused and that chat open. A stranger (a message request, decision of 2026-10-16) never
 * raises one. In a room, the room's rule decides: every message, mentions only (the default), or
 * never. With the preview off, the body is `HIDDEN_PREVIEW`: the text of a letter never reaches
 * the notification center.
 */
/** The body when the user does not want the text of a letter in the notification center. */
export const HIDDEN_PREVIEW = 'New letter';

export function createNotificationsService(
  deps: Pick<CoreDependencies, 'notifier' | 'chat' | 'room' | 'roster'>,
  events: EventBus,
): NotificationsService {
  let focused = true;
  let openChat: string | null = null;
  let showPreview = true;

  events.on('message.received', (message) => {
    if (message.direction !== 'in') return;
    if (focused && openChat === message.chatId) return;
    void notify(message);
  });

  async function notify(message: Message) {
    const [chats, rooms, contacts] = await Promise.all([
      deps.chat.list(),
      deps.room.list(),
      deps.roster.list(),
    ]);
    const chat = chats.find((c) => c.id === message.chatId);
    const room = rooms.find((r) => r.jid === message.chatId);
    if (room && !roomWants(room, message)) return;
    if (!room && chat && isStranger(contacts, chat)) return;
    const title = room
      ? `${message.fromNick ?? ''} · ${room.name}`.replace(/^ · /, '')
      : (chat?.title ?? message.fromJid.split('@')[0] ?? message.fromJid);
    const body = showPreview ? preview(message) : HIDDEN_PREVIEW;
    await deps.notifier.show({ title, body, chatId: message.chatId });
  }

  return {
    setWindowFocused(value) {
      focused = value;
    },
    setOpenChat(chatId) {
      openChat = chatId;
    },
    setShowPreview(value) {
      showPreview = value;
    },
    getShowPreview() {
      return showPreview;
    },
  };
}

function roomWants(room: Room, message: Message): boolean {
  if (room.notify === 'none') return false;
  if (room.notify === 'all') return true;
  return message.isMention;
}

function preview(message: Message): string {
  if (message.encryption === 'undecryptable') return '🔏';
  if (message.attachments.length > 0 && !message.body) return '📦';
  return message.body.length > 140 ? `${message.body.slice(0, 139)}…` : message.body;
}
