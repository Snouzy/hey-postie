import type { Core } from '@hey-postie/core';
import { trackWindowFocus } from './focus';
import { openChatsFromXmppLinks } from './links';
import { openChatOnNotificationClick } from './notificationClicks';
import { trackUnreadCount } from './unread';

/** Everything the desktop shell adds around the interface, for the lifetime of the app. */
export async function startDesktopIntegrations(core: Core): Promise<void> {
  trackUnreadCount(core);
  await Promise.all([
    trackWindowFocus(core),
    openChatOnNotificationClick(core),
    openChatsFromXmppLinks(core),
  ]);
}
