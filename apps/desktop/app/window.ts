import { getCurrentWindow } from '@tauri-apps/api/window';

/** Shows the window (closing it only hides it), restores it when minimized, gives it the focus. */
export async function focusMainWindow(): Promise<void> {
  const window = getCurrentWindow();
  await window.show();
  await window.unminimize();
  await window.setFocus();
}
