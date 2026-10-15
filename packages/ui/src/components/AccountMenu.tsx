import type { Account } from '@hey-postie/core';
import { ChevronDown, LogOut, UserX } from 'lucide-react';
import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import styles from './AccountMenu.module.css';
import { PresenceDot } from './PresenceDot';

interface AccountMenuProps {
  account: Account;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}

/**
 * The account row of the sidebar, which opens a small card: the JID, then a menu with "Sign out"
 * and "Delete my account…". Arrows move between items, Esc, Tab out or a click outside closes it
 * and the focus goes back to the row. Deleting the account must stay two clicks away (App Store
 * rule 5.1.1(v)).
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

  function items(): HTMLElement[] {
    return [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  }

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  // The row takes the focus back first, so the dialog that opens knows it as its opener.
  function pick(action: () => void) {
    trigger.current?.focus();
    setOpen(false);
    action();
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return close();
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    // From outside the items, Down starts at the first and Up at the last.
    const next =
      at === -1
        ? event.key === 'ArrowDown'
          ? 0
          : all.length - 1
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length;
    all[next]?.focus();
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
        <div className={styles.card}>
          <p className={styles.jid}>{account.jid}</p>
          <div
            id={menuId}
            className={styles.menu}
            role="menu"
            aria-label={text('accountMenu.open')}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
          >
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
        </div>
      )}
    </div>
  );
}
