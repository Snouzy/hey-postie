import type { Core } from '@hey-postie/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Tells the notifications service whether the user is looking at the window: Tauri's focus
 * events, plus the document visibility (a hidden window is never "focused").
 */
export async function trackWindowFocus(core: Core): Promise<void> {
  const window = getCurrentWindow();
  document.addEventListener('visibilitychange', () => {
    core.notifications.setWindowFocused(
      document.visibilityState === 'visible' && document.hasFocus(),
    );
  });
  await window.onFocusChanged(({ payload }) => core.notifications.setWindowFocused(payload));
  core.notifications.setWindowFocused(await window.isFocused());
}
