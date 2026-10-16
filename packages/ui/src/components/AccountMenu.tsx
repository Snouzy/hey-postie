import { type Account, MAX_STATUS_LENGTH, type PresenceShow } from '@hey-postie/core';
import { ChevronDown, KeyRound, LogOut, Settings, UserX } from 'lucide-react';
import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { cn } from '../lib/cn';
import { Avatar } from './Avatar';
import { PresenceDot } from './PresenceDot';

const SHOWS: readonly PresenceShow[] = ['online', 'away', 'dnd'];

const TRIGGER =
  'flex w-full cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent p-2 text-left text-ink transition-[background-color] duration-(--motion-fast) hover:bg-paper-raised aria-expanded:bg-paper-raised';
/** `hp-account-card` (theme/extras/sidebar.css): the card fades in when it opens. */
const CARD =
  'hp-account-card absolute top-[calc(100%+var(--space-1))] right-0 left-0 z-float flex flex-col rounded border border-line bg-paper-raised p-2 shadow-card';
/** The presence picker: three radios with their dot, then the status sentence and its counter. */
const PRESENCE = 'm-0 flex flex-col gap-1 border-none p-2 disabled:opacity-60';
const STATUS =
  'mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line p-2 has-[input:disabled]:opacity-60';
const LEGEND = 'p-0 text-[12px] font-semibold text-ink-muted';
const STATUS_INPUT =
  'min-w-0 flex-1 rounded-sm border border-line-strong bg-paper px-2 py-1 text-ink transition-[border-color] duration-(--motion-fast) focus-visible:border-navy';
const ITEM =
  'flex cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent p-2 text-left text-ink hover:bg-paper focus-visible:bg-paper data-[tone=danger]:text-red';

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

  // A blur without relatedTarget is not a Tab out: WebKit (the Tauri webview on macOS) does not
  // focus a button on mousedown, so a click on an item blurs the menu to nowhere first; closing
  // here would unmount the item before its click. A click outside is heard on pointerdown.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && !root.current?.contains(next)) setOpen(false);
  }

  // Heard on the whole card: Esc closes it from the picker and the status field too.
  function onCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
    <div ref={root} className="relative min-w-0 flex-1">
      <button
        ref={trigger}
        type="button"
        className={TRIGGER}
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
        <span className="min-w-0 flex-1 truncate font-semibold">{account.displayName}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: the keys are handled for the controls inside
        <div className={CARD} onKeyDown={onCardKeyDown} onBlur={onBlur}>
          <p className="m-0 p-2 font-mono text-[12px] wrap-anywhere text-ink-muted">
            {account.jid}
          </p>
          <fieldset className={PRESENCE} disabled={!online}>
            <legend className={cn(LEGEND, 'mb-1')}>{text('accountMenu.presence')}</legend>
            {SHOWS.map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-2">
                <input
                  className="m-0 accent-navy"
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
          <div className={STATUS}>
            <label htmlFor={statusId} className={cn(LEGEND, 'm-0 w-full')}>
              {text('accountMenu.status')}
            </label>
            <input
              id={statusId}
              className={STATUS_INPUT}
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
              className="text-[11px] text-ink-muted tabular-nums data-[over]:text-red"
              data-over={status.length > MAX_STATUS_LENGTH ? '' : undefined}
            >
              {status.length}/{MAX_STATUS_LENGTH}
            </span>
            {error && (
              <p
                className="m-0 w-full font-heading text-[13px] text-red [font-variation-settings:'SOFT'_100]"
                role="alert"
              >
                {text(error)}
              </p>
            )}
          </div>
          <div
            id={menuId}
            className="flex flex-col"
            role="menu"
            aria-label={text('accountMenu.open')}
            onKeyDown={onKeyDown}
          >
            <button type="button" role="menuitem" className={ITEM} onClick={() => pick(onSignOut)}>
              <LogOut size={16} aria-hidden />
              {text('main.signOut')}
            </button>
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={() => pick(onMyDevices)}
            >
              <KeyRound size={16} aria-hidden />
              {text('accountMenu.devices')}
            </button>
            <button type="button" role="menuitem" className={ITEM} onClick={() => pick(onSettings)}>
              <Settings size={16} aria-hidden />
              {text('accountMenu.settings')}
            </button>
            <button
              type="button"
              role="menuitem"
              className={ITEM}
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
