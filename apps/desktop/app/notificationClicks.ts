import type { Core } from '@hey-postie/core';
import { onAction } from '@tauri-apps/plugin-notification';
import { focusMainWindow } from './window';

/**
 * A click on a notification brings the window to front and asks the interface to show the chat
 * whose id the notifier put in `extra`. The plugin only reports clicks on notifications shown
 * while a listener existed, so this runs at startup, before any notification.
 */
export async function openChatOnNotificationClick(core: Core): Promise<void> {
  await onAction((event) => {
    const chatId = event.notification?.extra.chatId;
    if (typeof chatId !== 'string') return;
    void focusMainWindow();
    core.events.emit('chat.requested', { chatId });
  });
}
