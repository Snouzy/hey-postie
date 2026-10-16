import { type Chat, MESSAGE_PAGE_SIZE, type Message } from '@hey-postie/core';
import { useEffect, useRef, useState } from 'react';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * The messages of the open chat: the first page on mount, then every `message.received` and
 * `message.updated` for that chat, older pages on demand. A letter sent from here reaches the
 * list through `message.received` too, whoever called `chats.send`. Marks the chat read as
 * letters arrive while the window has the focus, and again when it regains it.
 */
export function useMessages(chat: Chat) {
  const core = useCore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  // The first page has answered (or failed): only then is an empty list an empty chat.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  // The latest version of each message the events brought: a page loaded from the server may be
  // older than an event that arrived while it was on its way, and the event wins.
  const fromEvents = useRef(new Map<string, Message>());

  useEffect(() => {
    let cancelled = false;
    core.chats
      .messages(chat.id)
      // Messages received while loading are already in the list: keep them.
      .then((loaded) => {
        if (cancelled) return;
        setMessages((current) => mergeById(fresh(loaded, fromEvents.current), current));
        // A first page shorter than a page is the whole history: nothing older to ask for.
        setHasOlder(loaded.length >= MESSAGE_PAGE_SIZE);
      })
      .catch((caught: unknown) => !cancelled && setError(errorKey(caught)))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [core, chat.id]);

  useCoreEvent('message.received', (message) => {
    if (message.chatId !== chat.id) return;
    fromEvents.current.set(message.id, message);
    setMessages((current) => mergeById(current, [message]));
    // Only a reader who can see the window has read it.
    if (document.hasFocus()) void core.chats.markRead(chat.id).catch(() => {});
  });

  useCoreEvent('message.updated', (message) => {
    if (message.chatId !== chat.id) return;
    fromEvents.current.set(message.id, message);
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
      else setMessages((current) => mergeById(fresh(older, fromEvents.current), current));
      return older.length > 0;
    } catch (caught) {
      setError(errorKey(caught));
      return false;
    }
  }

  async function send(body: string) {
    await core.chats.send(chat.id, body);
    setError(null);
  }

  function retry(failed: Message) {
    setMessages((current) => current.filter((m) => m.id !== failed.id));
    send(failed.body).catch((caught: unknown) => {
      add(failed);
      setError(errorKey(caught));
    });
  }

  function react(message: Message, emoji: string) {
    core.chats
      .toggleReaction(chat.id, message.id, emoji)
      .catch((caught: unknown) => setError(errorKey(caught)));
  }

  return { messages, hasOlder, loaded, error, setError, add, loadOlder, send, retry, react };
}

/** The loaded page, with every message the events already brought in its newer version. */
function fresh(loaded: Message[], fromEvents: Map<string, Message>): Message[] {
  return loaded.map((message) => fromEvents.get(message.id) ?? message);
}

/** `first` then whatever in `second` is not already there, by id. Order within each is kept. */
export function mergeById(first: Message[], second: Message[]): Message[] {
  const seen = new Set(first.map((m) => m.id));
  return [...first, ...second.filter((m) => !seen.has(m.id))];
}
