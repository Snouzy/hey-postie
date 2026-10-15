import type { Core } from '@hey-postie/core';
import { trackWindowFocus } from './focus';
import { openChatsFromXmppLinks } from './links';
import { openChatOnNotificationClick } from './notificationClicks';
import { runSmokeLogin } from './smoke';
import { trackUnreadCount } from './unread';
import { checkForUpdatesAtStartup } from './updater';

/** Everything the desktop shell adds around the interface, for the lifetime of the app. */
export async function startDesktopIntegrations(core: Core): Promise<void> {
  trackUnreadCount(core);
  await Promise.all([
    trackWindowFocus(core),
    openChatOnNotificationClick(core),
    openChatsFromXmppLinks(core),
  ]);
  await runSmokeLogin(core);
  // Last and never blocking: an unreachable release server must not delay the sign-in.
  checkForUpdatesAtStartup().catch((error: unknown) =>
    console.warn('[updater] check failed', error),
  );
}
