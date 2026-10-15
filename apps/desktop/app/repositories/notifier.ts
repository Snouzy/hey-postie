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

  async show(input: { title: string; body: string; chatId: string }): Promise<void> {
    if (!(await isPermissionGranted()) && !(await this.request())) return;
    sendNotification({ title: input.title, body: input.body, extra: { chatId: input.chatId } });
  }

  private request(): Promise<boolean> {
    this.requested ??= requestPermission().then((permission) => permission === 'granted');
    return this.requested;
  }
}
