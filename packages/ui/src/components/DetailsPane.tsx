import type { Chat, Room } from '@hey-postie/core';
import { Details } from './Details';
import { RoomDetails } from './RoomDetails';

interface DetailsPaneProps {
  chat: Chat;
  /** The hall behind the chat, when the app has a record of it. */
  room: Room | undefined;
  /** Counts the "Check their devices" requests; each new one focuses the Encryption section. */
  focusRequest: number;
  onClose: () => void;
  /** After a change the core may not announce (the notify rule): Main re-reads the halls. */
  onRoomsChanged: () => Promise<void>;
  /** After leaving a hall: Main drops the selection. */
  onLeft: () => void;
}

/**
 * The right pane for the open chat: the contact's details, or the hall's. Keyed by the chat so
 * that switching chats never shows the previous peer's devices. Nothing for a hall without a
 * record (left for good): there is no pane to show.
 */
export function DetailsPane({
  chat,
  room,
  focusRequest,
  onClose,
  onRoomsChanged,
  onLeft,
}: DetailsPaneProps) {
  if (chat.kind === 'direct') {
    return <Details key={chat.id} chat={chat} focusRequest={focusRequest} onClose={onClose} />;
  }
  if (!room) return null;
  return (
    <RoomDetails
      key={room.jid}
      room={room}
      focusRequest={focusRequest}
      onChanged={onRoomsChanged}
      onClose={onClose}
      onLeft={onLeft}
    />
  );
}
