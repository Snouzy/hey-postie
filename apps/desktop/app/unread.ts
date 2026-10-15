import type { Core } from '@hey-postie/core';
import { invoke } from '@tauri-apps/api/core';

/** Keeps the tray and the dock badge at the total of unread messages, across all chats. */
export function trackUnreadCount(core: Core): void {
  const refresh = async () => {
    const chats = await core.chats.list();
    const count = chats.reduce((total, chat) => total + chat.unreadCount, 0);
    await invoke('set_unread_count', { count });
  };
  const run = () => {
    refresh().catch((error: unknown) => console.warn('[unread] cannot update the badge', error));
  };
  run();
  core.events.on('chat.updated', run);
}
