import type { Chat, Room } from '@hey-postie/core';
import { X } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';
import { Button } from './Button';
import { Details } from './Details';
import styles from './DetailsPane.module.css';
import { EmptyState } from './EmptyState';
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
 * that switching chats never shows the previous peer's devices. A hall without a record (left
 * for good) has nothing to show: Postie says so, and the pane still closes.
 */
export function DetailsPane({
  chat,
  room,
  focusRequest,
  onClose,
  onRoomsChanged,
  onLeft,
}: DetailsPaneProps) {
  const text = useText();
  if (chat.kind === 'direct') {
    return <Details key={chat.id} chat={chat} focusRequest={focusRequest} onClose={onClose} />;
  }
  if (!room) {
    return (
      <aside className={styles.pane} aria-label={text('main.details')}>
        <Button variant="ghost" onClick={onClose} aria-label={text('main.closeDetails')}>
          <X size={18} aria-hidden />
        </Button>
        <EmptyState
          illustration={<Postie mood="searching" label={text('postie.alt.searching')} size={96} />}
          title={text('main.detailsEmpty')}
          sentence={text('main.detailsEmptyHint')}
        />
      </aside>
    );
  }
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
