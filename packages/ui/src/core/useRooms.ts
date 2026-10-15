import type { Chat, Room } from '@hey-postie/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * The halls as the service sorts them, re-read on every `room.updated` (a topic, a count, a join
 * or a leave from elsewhere). Same request counter as `useChats`: only the latest answer counts.
 */
export function useRooms(): { rooms: Room[]; refresh: () => Promise<void> } {
  const core = useCore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const requests = useRef(0);
  const refresh = useCallback(async () => {
    requests.current += 1;
    const mine = requests.current;
    try {
      const list = await core.rooms.list();
      if (mine === requests.current) setRooms(list.filter((r) => r.joined || r.bookmarked));
    } catch {
      if (mine === requests.current) setRooms([]);
    }
  }, [core]);
  useEffect(() => void refresh(), [refresh]);
  useCoreEvent('room.updated', () => void refresh());
  return { rooms, refresh };
}

/**
 * The sidebar rows: the chats, with every hall among them. A hall with no message yet is not in
 * `chats.list()`, so it gets a row of its own; one that is gets the hall's name and kind.
 */
export function withRooms(chats: Chat[], rooms: Room[]): Chat[] {
  const byJid = new Map(rooms.map((room) => [room.jid, room]));
  const rows = chats.map((chat) => {
    const room = byJid.get(chat.id);
    return room ? { ...chat, kind: 'room' as const, title: room.name } : chat;
  });
  // A hall with no message yet is most likely the one just joined: it goes to the top.
  const listed = new Set(chats.map((chat) => chat.id));
  const fresh = rooms.filter((room) => !listed.has(room.jid)).map(roomChat);
  return [...fresh, ...rows];
}

export function roomChat(room: Room): Chat {
  return {
    id: room.jid,
    kind: 'room',
    peerJid: room.jid,
    title: room.name,
    unreadCount: room.unreadCount,
    encrypted: false,
  };
}
