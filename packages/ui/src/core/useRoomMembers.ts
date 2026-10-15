import type { RoomMember } from '@hey-postie/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * Who is in a hall, re-read from the service on every `room.members` for that hall. An empty
 * `jid` (a direct chat) asks nothing and gives an empty list.
 */
export function useRoomMembers(jid: string): RoomMember[] {
  const core = useCore();
  const [members, setMembers] = useState<RoomMember[]>([]);
  const requests = useRef(0);
  const refresh = useCallback(async () => {
    if (!jid) return;
    requests.current += 1;
    const mine = requests.current;
    const list = await core.rooms.members(jid);
    if (mine === requests.current) setMembers(list);
  }, [core, jid]);
  useEffect(() => {
    refresh().catch(() => setMembers([]));
  }, [refresh]);
  useCoreEvent('room.members', (payload) => {
    if (payload.jid === jid) void refresh().catch(() => {});
  });
  return members;
}
