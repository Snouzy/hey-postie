import type { Account, PresenceShow } from '@hey-postie/core';
import { ChevronDown, KeyRound, LogOut, Settings, UserX } from 'lucide-react';
import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import styles from './AccountMenu.module.css';
import { Avatar } from './Avatar';
import { PresenceDot } from './PresenceDot';

const SHOWS: readonly PresenceShow[] = ['online', 'away', 'dnd'];
/** Mirrors `MAX_STATUS_LENGTH` of the accounts service, which refuses a longer sentence. */
export const STATUS_MAX_LENGTH = 140;

interface AccountMenuProps {
  account: Account;
  onSignOut: () => void;
  /** Opens the "My devices" dialog (own OMEMO keys). */
  onMyDevices: () => void;
  onSettings: () => void;
  onDeleteAccount: () => void;
}

/**
 * The account row of the sidebar, which opens a small card: the JID, the presence picker and the
 * status sentence, then a menu with "Sign out", "My devices…", "Settings…" and "Delete my
 * account…". Arrows move between items, Esc, Tab out or a click outside closes it and the focus
 * goes back to the row. Deleting the account must stay two clicks away (App Store rule 5.1.1(v)).
 */
export function AccountMenu({
  account,
  onSignOut,
  onMyDevices,
  onSettings,
  onDeleteAccount,
}: AccountMenuProps) {
  const core = useCore();
  const text = useText();
  const menuId = useId();
  const statusId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(account.presence?.status ?? '');
  const [error, setError] = useState<MessageKey | null>(null);
  const online = account.state === 'online';
  const show: PresenceShow = account.presence?.show ?? 'online';

  async function setPresence(next: PresenceShow, sentence: string) {
    setError(null);
    try {
      await core.accounts.setPresence({ show: next, status: sentence });
    } catch (caught) {
      setError(errorKey(caught));
    }
  }

  function onStatusKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void setPresence(show, status);
  }

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
        <Avatar name={account.displayName} jid={account.jid} avatarUrl={account.avatarUrl} />
        <PresenceDot presence={online ? show : 'offline'} />
        <span className={styles.name}>{account.displayName}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div className={styles.card}>
          <p className={styles.jid}>{account.jid}</p>
          <fieldset className={styles.presence} disabled={!online}>
            <legend className={styles.legend}>{text('accountMenu.presence')}</legend>
            {SHOWS.map((value) => (
              <label key={value} className={styles.choice}>
                <input
                  type="radio"
                  name="presence"
                  value={value}
                  checked={show === value}
                  onChange={() => void setPresence(value, status)}
                />
                <PresenceDot presence={value} />
                {text(value === 'online' ? 'accountMenu.available' : `presence.${value}`)}
              </label>
            ))}
          </fieldset>
          <div className={styles.status}>
            <label htmlFor={statusId} className={styles.legend}>
              {text('accountMenu.status')}
            </label>
            <input
              id={statusId}
              className={styles.statusInput}
              type="text"
              value={status}
              placeholder={text('accountMenu.statusPlaceholder')}
              disabled={!online}
              aria-describedby={`${statusId}-count`}
              onChange={(event) => setStatus(event.target.value)}
              onKeyDown={onStatusKeyDown}
            />
            <span
              id={`${statusId}-count`}
              className={styles.counter}
              data-over={status.length > STATUS_MAX_LENGTH ? '' : undefined}
            >
              {status.length}/{STATUS_MAX_LENGTH}
            </span>
            {error && (
              <p className={styles.error} role="alert">
                {text(error)}
              </p>
            )}
          </div>
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
              onClick={() => pick(onMyDevices)}
            >
              <KeyRound size={16} aria-hidden />
              {text('accountMenu.devices')}
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => pick(onSettings)}
            >
              <Settings size={16} aria-hidden />
              {text('accountMenu.settings')}
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
