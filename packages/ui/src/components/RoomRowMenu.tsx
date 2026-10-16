import type { Room } from '@hey-postie/core';
import { DoorOpen, Ellipsis } from 'lucide-react';
import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { Popover } from './Popover';
import styles from './RoomRowMenu.module.css';

interface RoomRowMenuProps {
  room: Room;
  /** The list owns which row's menu is open: a right-click on the row opens it too. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** "Leave the hall…": the caller opens the confirmation. */
  onLeave: (room: Room) => void;
}

/**
 * The "⋯" of a room row and its small menu. The focus goes to the first item on open and back
 * to whatever opened the menu (the "⋯", or the row on a right-click) on close; Esc, Tab out and a
 * click outside close it. Picking an item gives the focus back first, so the dialog that follows
 * knows its opener.
 */
export function RoomRowMenu({ room, open, onOpen, onClose, onLeave }: RoomRowMenuProps) {
  const text = useText();
  const menuId = useId();
  const more = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current =
      active instanceof HTMLElement && active !== document.body ? active : more.current;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  function close() {
    onClose();
    opener.current?.focus();
  }

  function pick() {
    close();
    onLeave(room);
  }

  // Tab out: the menu goes away and the focus continues on its way.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!menu.current?.contains(event.relatedTarget as Node | null)) onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The list moves between rows with the arrows; inside the menu they stay on its items.
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }

  return (
    <>
      <button
        ref={more}
        type="button"
        className={styles.more}
        aria-label={text('chatList.more')}
        title={text('chatList.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={open ? close : onOpen}
      >
        <Ellipsis size={16} aria-hidden />
      </button>
      {open && (
        <Popover anchor={more.current} label={room.name} prefer="below" onClose={close}>
          <div
            ref={menu}
            id={menuId}
            className={styles.menu}
            role="menu"
            aria-label={room.name}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
          >
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              data-tone="danger"
              onClick={pick}
            >
              <DoorOpen size={16} aria-hidden />
              {text('room.leaveMenu')}
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}
