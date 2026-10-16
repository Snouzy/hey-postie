import type { RoomPerson } from '@hey-postie/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * The people of a hall as the service orders them (present first, owners and admins first),
 * re-read on every `room.members` for that hall and after a change made here (`refresh`).
 * Same request counter as `useRoomMembers`: only the latest answer counts. An empty `jid` (a
 * direct chat) asks nothing and gives an empty list.
 */
export function useRoomPeople(jid: string): { people: RoomPerson[]; refresh: () => Promise<void> } {
  const core = useCore();
  const [people, setPeople] = useState<RoomPerson[]>([]);
  const requests = useRef(0);
  const refresh = useCallback(async () => {
    if (!jid) return;
    requests.current += 1;
    const mine = requests.current;
    try {
      const list = await core.rooms.people(jid);
      if (mine === requests.current) setPeople(list);
    } catch {
      if (mine === requests.current) setPeople([]);
    }
  }, [core, jid]);
  useEffect(() => void refresh(), [refresh]);
  useCoreEvent('room.members', (payload) => {
    if (payload.jid === jid) void refresh();
  });
  return { people, refresh };
}
