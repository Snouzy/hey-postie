import { useEffect, useRef, useState } from 'react';
import { useCoreEvent } from './useCoreEvent';

/** A `composing` with no news for this long is forgotten: a lost `paused` must not stick. */
export const TYPING_STALE_MS = 10_000;

/**
 * Who is typing in a chat, from `chat.typing`: the senders' JIDs (in a hall, `room@x/nick`),
 * in the order they started. Each one goes on `typing: false` or after `TYPING_STALE_MS`.
 */
export function useTyping(chatId: string): string[] {
  const [typing, setTyping] = useState<string[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  function forget(fromJid: string) {
    const timer = timers.current.get(fromJid);
    if (timer) clearTimeout(timer);
    timers.current.delete(fromJid);
    setTyping((list) => (list.includes(fromJid) ? list.filter((jid) => jid !== fromJid) : list));
  }

  useCoreEvent('chat.typing', (event) => {
    if (event.chatId !== chatId) return;
    if (!event.typing) return forget(event.fromJid);
    const previous = timers.current.get(event.fromJid);
    if (previous) clearTimeout(previous);
    timers.current.set(
      event.fromJid,
      setTimeout(() => forget(event.fromJid), TYPING_STALE_MS),
    );
    setTyping((list) => (list.includes(event.fromJid) ? list : [...list, event.fromJid]));
  });

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return typing;
}
