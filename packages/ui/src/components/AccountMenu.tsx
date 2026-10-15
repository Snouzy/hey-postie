import type { Account } from '@hey-postie/core';
import { ChevronDown, LogOut, UserX } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import styles from './AccountMenu.module.css';
import { PresenceDot } from './PresenceDot';

interface AccountMenuProps {
  account: Account;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}

/**
 * The account row of the sidebar, which opens a small menu: the JID, "Sign out" and "Delete my
 * account…". Arrows move between items, Esc or a click outside closes it and the focus goes
 * back to the row. Deleting the account must stay two clicks away (App Store rule 5.1.1(v)).
 */
export function AccountMenu({ account, onSignOut, onDeleteAccount }: AccountMenuProps) {
  const text = useText();
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const online = account.state === 'online';

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

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') return close();
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  }

  return (
    <div ref={root} className={styles.root}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        // The name stays the display name, as before; the dot keeps its own title for the eye.
        aria-label={account.displayName}
        title={text('accountMenu.open')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <PresenceDot presence={online ? 'online' : 'offline'} />
        <span className={styles.name}>{account.displayName}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          className={styles.menu}
          role="menu"
          aria-label={text('accountMenu.open')}
          onKeyDown={onKeyDown}
        >
          <p className={styles.jid}>{account.jid}</p>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => pick(onSignOut)}
          >
            <LogOut size={16} aria-hidden />
            {text('main.signOut')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            data-tone="danger"
            onClick={() => pick(onDeleteAccount)}
          >
            <UserX size={16} aria-hidden />
            {text('accountMenu.delete')}
          </button>
        </div>
      )}
    </div>
  );
}
