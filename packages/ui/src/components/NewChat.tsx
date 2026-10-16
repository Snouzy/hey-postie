import type { Account, Contact, Room } from '@hey-postie/core';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Dialog } from './Dialog';
import { Field } from './Field';
import { NewChatPicker, pickerRowId } from './NewChatPicker';
import { type PickerRow, pickerRows } from './pickerRows';

interface NewChatProps {
  account: Account;
  contacts: Contact[];
  /** The joined or bookmarked halls. */
  rooms: Room[];
  /** Main opens direct chats; what went wrong, if anything, comes back here. */
  error: MessageKey | null;
  onOpen: (jid: string) => void;
  /** A hall picked here is joined by the dialog itself, then handed to Main to select. */
  onJoined: (room: Room) => void;
  onClose: () => void;
}

const NOTE = "m-0 font-heading [font-variation-settings:'SOFT'_100]";

/**
 * "New chat": one search field over the address book and the halls, with the typed text as an
 * address on the last row. Arrows move the active row, Enter picks it, a click picks any row;
 * the focus never leaves the field (Esc closes, through `Dialog`).
 */
export function NewChat({
  account,
  contacts,
  rooms,
  error,
  onOpen,
  onJoined,
  onClose,
}: NewChatProps) {
  const core = useCore();
  const text = useText();
  const errorId = useId();
  const listId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [localPart, domain] = account.jid.split('@');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [roomService, setRoomService] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<MessageKey | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    form.current?.querySelector('input')?.focus({ preventScroll: true });
  }, []);

  // The server says where its halls are; an address there is a hall to join, not someone to write to.
  useEffect(() => {
    let cancelled = false;
    core.rooms
      .roomService(domain ?? '')
      .then((service) => !cancelled && setRoomService(service))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [core, domain]);

  const rows = useMemo(
    () => pickerRows({ query, contacts, rooms, roomService }),
    [query, contacts, rooms, roomService],
  );
  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));
  const shownError = joinError ?? error;
  const nobody = query.trim() !== '' && !rows.some((row) => row.kind !== 'address' || row.valid);

  async function join(jid: string, nick: string) {
    setJoining(true);
    setJoinError(null);
    try {
      onJoined(await core.rooms.join({ jid, nick }));
    } catch (caught) {
      setJoinError(errorKey(caught));
    } finally {
      setJoining(false);
    }
  }

  function pick(row: PickerRow) {
    if (joining) return;
    if (row.kind === 'contact') onOpen(row.contact.jid);
    else if (row.kind === 'room') {
      if (row.room.joined) onJoined(row.room);
      else void join(row.room.jid, row.room.nick || localPart || '');
    } else if (row.target === 'room') void join(row.jid, localPart ?? '');
    else onOpen(row.jid);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rows.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) pick(row);
    }
  }

  return (
    <Dialog title={text('newChat.title')} onClose={onClose} closable={!joining}>
      <form
        ref={form}
        className="flex min-w-[360px] flex-col gap-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field
          label={text('newChat.search')}
          type="text"
          role="combobox"
          autoComplete="off"
          placeholder={text('signIn.jidPlaceholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setJoinError(null);
          }}
          onKeyDown={onKeyDown}
          aria-controls={listId}
          aria-expanded={rows.length > 0}
          aria-activedescendant={rows.length > 0 ? pickerRowId(listId, activeIndex) : undefined}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? errorId : undefined}
        />
        {shownError && (
          <p id={errorId} className={`${NOTE} text-red`} role="alert">
            {text(shownError)}
          </p>
        )}
        {nobody && <p className={`${NOTE} text-ink-muted`}>{text('newChat.nobody')}</p>}
        <NewChatPicker id={listId} rows={rows} activeIndex={activeIndex} onPick={pick} />
      </form>
    </Dialog>
  );
}
