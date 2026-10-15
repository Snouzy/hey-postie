import type { Chat } from '@hey-postie/core';
import { useCallback, useEffect, useState } from 'react';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * The chat list as the service sorts it. Every `chat.updated` asks the service again rather than
 * patching locally, so the order on screen is always the one `chats.list()` defines.
 */
export function useChats(): { chats: Chat[]; refresh: () => Promise<void> } {
  const core = useCore();
  const [chats, setChats] = useState<Chat[]>([]);
  const refresh = useCallback(async () => setChats(await core.chats.list()), [core]);
  useEffect(() => void refresh(), [refresh]);
  useCoreEvent('chat.updated', () => void refresh());
  return { chats, refresh };
}
