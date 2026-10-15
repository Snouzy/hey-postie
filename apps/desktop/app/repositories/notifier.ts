import type { Notifier } from '@hey-postie/core';

/** Placeholder until system notifications land (milestone 1). Logs the chat id only. */
export class ConsoleNotifier implements Notifier {
  async show(input: { title: string; body: string; chatId: string }): Promise<void> {
    console.info('[notifier] would notify for chat', input.chatId);
  }
}
