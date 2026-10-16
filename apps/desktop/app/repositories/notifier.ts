import type { Notifier } from '@hey-postie/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

/**
 * System notifications through the Tauri notification plugin. The chat id travels in `extra`, so
 * that a click can open the chat (see `app/notificationClicks.ts`). Permission is requested once
 * per run; a refusal is silent, the message still arrives in the window.
 */
export class TauriNotifier implements Notifier {
  private requested: Promise<boolean> | null = null;
  private readonly sound = notificationSound(navigator.userAgent);

  async show(input: { title: string; body: string; chatId: string }): Promise<void> {
    if (!(await isPermissionGranted()) && !(await this.request())) return;
    sendNotification({
      title: input.title,
      body: input.body,
      sound: this.sound,
      extra: { chatId: input.chatId },
    });
  }

  private request(): Promise<boolean> {
    this.requested ??= requestPermission().then((permission) => permission === 'granted');
    return this.requested;
  }
}

/**
 * The system's own "new message" sound. Without one the plugin shows a silent notification on
 * every desktop, and each one names its default sound differently.
 */
export function notificationSound(userAgent: string): string {
  // mac-notification-sys maps this exact name to the alert sound the user chose in System Settings.
  if (userAgent.includes('Mac')) return 'NSUserNotificationDefaultSoundName';
  // tauri-winrt-notification reads "Default" as the toast's default sound.
  if (userAgent.includes('Windows')) return 'Default';
  // Linux and the BSDs: the freedesktop sound theme name for an incoming instant message.
  return 'message-new-instant';
}
