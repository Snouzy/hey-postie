import type { Chat } from '@hey-postie/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * The chat list as the service sorts it. Every `chat.updated` asks the service again rather than
 * patching locally, so the order on screen is always the one `chats.list()` defines. A
 * `contact.updated` asks again too: whether a chat is a stranger's depends on the address book.
 */
export function useChats(): { chats: Chat[]; refresh: () => Promise<void> } {
  const core = useCore();
  const [chats, setChats] = useState<Chat[]>([]);
  // Responses can come back out of order; only the latest request may set the list.
  const requests = useRef(0);
  const refresh = useCallback(async () => {
    requests.current += 1;
    const mine = requests.current;
    const list = await core.chats.list();
    if (mine === requests.current) setChats(list);
  }, [core]);
  useEffect(() => {
    refresh().catch(() => setChats([]));
  }, [refresh]);
  useCoreEvent('chat.updated', () => void refresh().catch(() => {}));
  useCoreEvent('contact.updated', () => void refresh().catch(() => {}));
  return { chats, refresh };
}
