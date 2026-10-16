import type { ChatRepository } from '../contracts/repositories';

/** While the user keeps typing, `composing` is repeated at most this often. */
export const COMPOSING_REPEAT_MS = 10_000;
/** After this much silence, `paused` goes out. */
export const PAUSED_AFTER_MS = 5_000;

interface Typing {
  state: 'composing' | 'paused';
  sentAt: number;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Our side of XEP-0085, one state per chat. Chat states are best effort: a failure to send one
 * is swallowed, the next keystroke tries again.
 */
export function createTypingTracker(chat: Pick<ChatRepository, 'setComposing'>) {
  const byChat = new Map<string, Typing>();

  const send = (chatId: string, composing: boolean): void => {
    void chat.setComposing(chatId, composing).catch(() => undefined);
  };

  const pause = (chatId: string): void => {
    const typing = byChat.get(chatId);
    if (!typing || typing.state === 'paused') return;
    clearTimeout(typing.timer);
    byChat.set(chatId, { state: 'paused', sentAt: typing.sentAt });
    send(chatId, false);
  };

  return {
    /** The user typed something. */
    keystroke(chatId: string): void {
      const now = Date.now();
      const typing = byChat.get(chatId);
      const stale =
        !typing || typing.state === 'paused' || now - typing.sentAt >= COMPOSING_REPEAT_MS;
      if (typing?.timer) clearTimeout(typing.timer);
      const timer = setTimeout(() => pause(chatId), PAUSED_AFTER_MS);
      byChat.set(chatId, { state: 'composing', sentAt: stale ? now : typing.sentAt, timer });
      if (stale) send(chatId, true);
    },
    /** The draft is empty again: say so now rather than after the silence. */
    cleared: pause,
    /** The message left: it carries `active` itself, nothing more to send. */
    sent(chatId: string): void {
      clearTimeout(byChat.get(chatId)?.timer);
      byChat.delete(chatId);
    },
  };
}
