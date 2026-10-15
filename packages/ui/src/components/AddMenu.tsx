import { DoorOpen, MessageSquarePlus, Plus, UserPlus } from 'lucide-react';
import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import styles from './AddMenu.module.css';
import { Button } from './Button';

interface AddMenuProps {
  onNewChat: () => void;
  onJoinRoom: () => void;
  onAddContact: () => void;
}

/**
 * The "+" of the sidebar: a small menu with the three ways to start something. Arrow keys move
 * between the items, Esc or a click outside closes it, focus goes back to the "+".
 */
export function AddMenu({ onNewChat, onJoinRoom, onAddContact }: AddMenuProps) {
  const text = useText();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  // The "+" takes the focus back first, so the dialog that opens knows it as its opener.
  function pick(action: () => void) {
    trigger.current?.focus();
    setOpen(false);
    action();
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  // Focus is inside the menu while it is open, so the menu itself hears the keys.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  }

  const items = [
    { label: text('main.newChat'), icon: MessageSquarePlus, action: onNewChat },
    { label: text('main.joinRoom'), icon: DoorOpen, action: onJoinRoom },
    { label: text('main.addContact'), icon: UserPlus, action: onAddContact },
  ];

  return (
    <div ref={root} className={styles.root}>
      <Button
        ref={trigger}
        variant="ghost"
        aria-label={text('main.add')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={18} aria-hidden />
      </Button>
      {open && (
        <div
          id={menuId}
          className={styles.menu}
          role="menu"
          aria-label={text('main.add')}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        >
          {items.map(({ label, icon: Icon, action }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => pick(action)}
            >
              <Icon size={16} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
