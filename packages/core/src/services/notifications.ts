import type { CoreDependencies } from '../container';
import type { EventBus } from '../contracts/events';
import type { NotificationsService } from '../contracts/services';
import type { Message } from '../contracts/types';

/**
 * Shows a system notification for an incoming message unless the user is already looking at it:
 * window focused and that chat open. Rooms (milestone 2) will add the mention rule here.
 */
export function createNotificationsService(
  deps: Pick<CoreDependencies, 'notifier' | 'chat'>,
  events: EventBus,
): NotificationsService {
  let focused = true;
  let openChat: string | null = null;

  events.on('message.received', (message) => {
    if (message.direction !== 'in') return;
    if (focused && openChat === message.chatId) return;
    void notify(message);
  });

  async function notify(message: Message) {
    const chats = await deps.chat.list();
    const chat = chats.find((c) => c.id === message.chatId);
    await deps.notifier.show({
      title: chat?.title ?? message.fromJid.split('@')[0] ?? message.fromJid,
      body: preview(message),
      chatId: message.chatId,
    });
  }

  return {
    setWindowFocused(value) {
      focused = value;
    },
    setOpenChat(chatId) {
      openChat = chatId;
    },
  };
}

function preview(message: Message): string {
  if (message.encryption === 'undecryptable') return '🔏';
  if (message.attachments.length > 0 && !message.body) return '📦';
  return message.body.length > 140 ? `${message.body.slice(0, 139)}…` : message.body;
}
