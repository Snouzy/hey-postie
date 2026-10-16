import type { Chat, Contact, Room } from '@hey-postie/core';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';
import { ArchivePanel } from './ArchivePanel';
import type { SaveFile } from './Attachments';
import { Button } from './Button';
import { Details } from './Details';
import { EmptyState } from './EmptyState';
import { RoomDetails } from './RoomDetails';

interface DetailsPaneProps {
  chat: Chat;
  /** The contact behind a direct chat, when it is in the address book. */
  contact: Contact | undefined;
  /** The hall behind the chat, when the app has a record of it. */
  room: Room | undefined;
  /** Counts the "Check their devices" requests; each new one focuses the Encryption section. */
  focusRequest: number;
  /** Counts the header's people button presses; each new one focuses a hall's People section. */
  peopleFocus: number;
  onClose: () => void;
  /** After a change the core may not announce (the notify rule): Main re-reads the halls. */
  onRoomsChanged: () => Promise<void>;
  /** After leaving or deleting a hall: Main drops the selection. */
  onLeft: () => void;
  /** "Invite people" from a hall's pane. */
  onInvite?: (() => void) | undefined;
  onOpenLink: (url: string) => void;
  onSaveFile: SaveFile;
  /** From the archive: the letter an item came with, shown in the conversation. */
  onShowInChat: (messageId: string) => void;
}

/**
 * The right pane for the open chat: the contact's details, or the hall's. Keyed by the chat so
 * that switching chats never shows the previous peer's devices. A hall without a record (left
 * for good) has nothing to show: Postie says so, and the pane still closes.
 */
export function DetailsPane({
  chat,
  contact,
  room,
  focusRequest,
  peopleFocus,
  onClose,
  onRoomsChanged,
  onLeft,
  onInvite,
  onOpenLink,
  onSaveFile,
  onShowInChat,
}: DetailsPaneProps) {
  const text = useText();
  // The chat whose archive is shown: another chat opens on its details again.
  const [archiveOf, setArchiveOf] = useState<string | null>(null);
  const openArchive = () => setArchiveOf(chat.id);
  if (archiveOf === chat.id) {
    return (
      <ArchivePanel
        key={chat.id}
        chat={chat}
        onBack={() => setArchiveOf(null)}
        onClose={onClose}
        onOpenLink={onOpenLink}
        onSaveFile={onSaveFile}
        onShowInChat={onShowInChat}
      />
    );
  }
  if (chat.kind === 'direct') {
    return (
      <Details
        key={chat.id}
        chat={chat}
        contact={contact}
        focusRequest={focusRequest}
        onClose={onClose}
        onOpenArchive={openArchive}
      />
    );
  }
  if (!room) {
    return (
      <aside
        className="flex w-[clamp(240px,var(--details-width,280px),480px)] shrink-0 flex-col items-end gap-4 border-l border-line bg-paper p-4 [&>:last-child]:self-stretch"
        aria-label={text('main.details')}
      >
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
      peopleFocus={peopleFocus}
      onChanged={onRoomsChanged}
      onClose={onClose}
      onLeft={onLeft}
      onInvite={onInvite}
      onOpenArchive={openArchive}
    />
  );
}
