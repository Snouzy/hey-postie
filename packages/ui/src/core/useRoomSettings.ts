import type { RoomSettings } from '@hey-postie/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCore } from './CoreProvider';

/**
 * A hall's name, description and visibility as its configuration says, or null while the server
 * has not answered (or will not say). `refresh` re-reads it after an edit made here.
 */
export function useRoomSettings(jid: string): {
  settings: RoomSettings | null;
  refresh: () => Promise<void>;
} {
  const core = useCore();
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const requests = useRef(0);
  const refresh = useCallback(async () => {
    requests.current += 1;
    const mine = requests.current;
    try {
      const found = await core.rooms.settings(jid);
      if (mine === requests.current) setSettings(found);
    } catch {
      if (mine === requests.current) setSettings(null);
    }
  }, [core, jid]);
  useEffect(() => void refresh(), [refresh]);
  return { settings, refresh };
}
