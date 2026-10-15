import type { Chat, Message } from '@hey-postie/core';
import { useEffect, useState } from 'react';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * The messages of the open chat: the first page on mount, then every `message.received` and
 * `message.updated` for that chat, older pages on demand. Marks the chat read as letters arrive
 * while the window has the focus, and again when it regains it.
 */
export function useMessages(chat: Chat) {
  const core = useCore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    core.chats
      .messages(chat.id)
      // Messages received while loading are already in the list: keep them.
      .then((loaded) => !cancelled && setMessages((current) => mergeById(loaded, current)))
      .catch((caught: unknown) => !cancelled && setError(errorKey(caught)));
    return () => {
      cancelled = true;
    };
  }, [core, chat.id]);

  useCoreEvent('message.received', (message) => {
    if (message.chatId !== chat.id) return;
    setMessages((current) => mergeById(current, [message]));
    // Only a reader who can see the window has read it.
    if (document.hasFocus()) void core.chats.markRead(chat.id).catch(() => {});
  });

  useCoreEvent('message.updated', (message) => {
    if (message.chatId !== chat.id) return;
    setMessages((current) => current.map((m) => (m.id === message.id ? message : m)));
  });

  useEffect(() => {
    const onFocus = () => void core.chats.markRead(chat.id).catch(() => {});
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [core, chat.id]);

  /** A message the service just handed back (a letter or a parcel sent from here). */
  function add(message: Message) {
    setMessages((current) => mergeById(current, [message]));
  }

  async function loadOlder(): Promise<boolean> {
    try {
      const older = await core.chats.loadOlder(chat.id);
      if (older.length === 0) setHasOlder(false);
      else setMessages((current) => mergeById(older, current));
      return older.length > 0;
    } catch (caught) {
      setError(errorKey(caught));
      return false;
    }
  }

  async function send(body: string) {
    add(await core.chats.send(chat.id, body));
  }

  function retry(failed: Message) {
    setMessages((current) => current.filter((m) => m.id !== failed.id));
    send(failed.body).catch(() => add(failed));
  }

  function react(message: Message, emoji: string) {
    core.chats
      .toggleReaction(chat.id, message.id, emoji)
      .catch((caught: unknown) => setError(errorKey(caught)));
  }

  return { messages, hasOlder, error, setError, add, loadOlder, send, retry, react };
}

/** `first` then whatever in `second` is not already there, by id. Order within each is kept. */
export function mergeById(first: Message[], second: Message[]): Message[] {
  const seen = new Set(first.map((m) => m.id));
  return [...first, ...second.filter((m) => !seen.has(m.id))];
}
