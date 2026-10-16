import { useEffect } from 'react';
import { useCore } from '../core/CoreProvider';

/**
 * Tells the notifications service what the user sees: the open chat (marked read as it opens)
 * and whether the window has the focus.
 */
export function useNotificationFocus(chatId: string | null): void {
  const core = useCore();

  useEffect(() => {
    core.notifications.setOpenChat(chatId);
    if (chatId) core.chats.markRead(chatId).catch(() => {});
  }, [core, chatId]);

  useEffect(() => {
    const focus = () => core.notifications.setWindowFocused(true);
    const blur = () => core.notifications.setWindowFocused(false);
    window.addEventListener('focus', focus);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', blur);
    };
  }, [core]);
}
