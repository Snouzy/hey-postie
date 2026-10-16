import type { Chat, Contact, Room } from '@hey-postie/core';
import type { RefObject } from 'react';
import type { SaveFile } from '../components/Attachments';
import { DetailsPane } from '../components/DetailsPane';
import { PaneResizer } from '../components/PaneResizer';
import { useText } from '../core/CoreProvider';
import { DETAILS_BOUNDS } from '../core/settings';

interface DetailsColumnProps {
  chat: Chat;
  contact: Contact | undefined;
  room: Room | undefined;
  width: number;
  /** The element that carries `--details-width` while the resizer is dragged. */
  target: RefObject<HTMLDivElement | null>;
  onResize: (width: number) => void;
  encryptionFocus: number;
  peopleFocus: number;
  onClose: () => void;
  onRoomsChanged: () => Promise<void>;
  onLeft: () => void;
  onInvite: (() => void) | undefined;
  onOpenLink: (url: string) => void;
  onSaveFile: SaveFile;
  onShowInChat: (messageId: string) => void;
}

/** The right column: its resizer, then the details of the open chat. */
export function DetailsColumn({
  chat,
  contact,
  room,
  width,
  target,
  onResize,
  encryptionFocus,
  peopleFocus,
  onClose,
  onRoomsChanged,
  onLeft,
  onInvite,
  onOpenLink,
  onSaveFile,
  onShowInChat,
}: DetailsColumnProps) {
  const text = useText();
  return (
    <>
      <PaneResizer
        pane="right"
        bounds={DETAILS_BOUNDS}
        width={width}
        collapsed={false}
        target={target}
        variable="--details-width"
        controls="details"
        label={text('main.resizeDetails')}
        onResize={onResize}
        // Folding the details is closing them: the header's button opens them again.
        onCollapse={onClose}
        onExpand={() => {}}
      />
      {/* Only an id for the resizer's `aria-controls`: the pane inside keeps its own width and borders. */}
      <div id="details" className="contents">
        <DetailsPane
          chat={chat}
          contact={contact}
          room={room}
          focusRequest={encryptionFocus}
          peopleFocus={peopleFocus}
          onClose={onClose}
          onRoomsChanged={onRoomsChanged}
          onLeft={onLeft}
          onInvite={onInvite}
          onOpenLink={onOpenLink}
          onSaveFile={onSaveFile}
          onShowInChat={onShowInChat}
        />
      </div>
    </>
  );
}
