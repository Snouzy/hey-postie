import type { Chat, Contact } from '@hey-postie/core';
import { Users } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { Avatar } from './Avatar';
import { Dialog } from './Dialog';
import { Field } from './Field';
import { PresenceDot } from './PresenceDot';

/** One place to go: a chat or hall already in the list, or a contact without a chat yet. */
export type SwitcherRow = { kind: 'chat'; chat: Chat } | { kind: 'contact'; contact: Contact };

const ROW =
  'flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-ink transition-[background-color] duration-(--motion-fast) hover:bg-fill-hover aria-selected:bg-fill-chosen';
const HINT = 'm-0 text-[12px] text-ink-muted';

/**
 * The places that match, most useful first: chats with unread letters, then the others by last
 * activity (the order of the list), then contacts without a chat, by name. An empty text lists
 * them all.
 */
export function switcherRows(query: string, chats: Chat[], contacts: Contact[]): SwitcherRow[] {
  const needle = query.trim().toLowerCase();
  const matches = (...texts: string[]) =>
    needle === '' || texts.some((t) => t.toLowerCase().includes(needle));
  const places = chats
    .filter((chat) => matches(chat.title, chat.id))
    .sort((a, b) => Number(b.unreadCount > 0) - Number(a.unreadCount > 0))
    .map((chat): SwitcherRow => ({ kind: 'chat', chat }));
  const withChat = new Set(chats.map((chat) => chat.peerJid));
  const people = contacts
    .filter((contact) => !withChat.has(contact.jid) && matches(contact.name, contact.jid))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((contact): SwitcherRow => ({ kind: 'contact', contact }));
  return [...places, ...people];
}

interface QuickSwitcherProps {
  chats: Chat[];
  contacts: Contact[];
  onPick: (row: SwitcherRow) => void;
  onClose: () => void;
}

/**
 * Cmd/Ctrl+K, the Slack way: "Go to…", a field that filters the chats, halls and contacts as the
 * user types; arrows move, Enter opens, Esc closes. The focus stays in the field (a combobox
 * naming the active row), like the New chat picker.
 */
export function QuickSwitcher({ chats, contacts, onPick, onClose }: QuickSwitcherProps) {
  const text = useText();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rows = useMemo(() => switcherRows(query, chats, contacts), [query, chats, contacts]);
  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));
  const rowId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    document.getElementById(rowId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
  });

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rows.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) onPick(row);
    }
  }

  return (
    <Dialog title={text('switcher.title')} onClose={onClose}>
      <div className="flex min-w-[360px] flex-col gap-3">
        <Field
          label={text('switcher.search')}
          type="text"
          role="combobox"
          autoComplete="off"
          placeholder={text('switcher.placeholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          aria-controls={listId}
          aria-expanded={rows.length > 0}
          aria-activedescendant={rows.length > 0 ? rowId(activeIndex) : undefined}
        />
        {rows.length === 0 ? (
          <p className="m-0 font-heading text-[14px] text-ink-muted [font-variation-settings:'SOFT'_100]">
            {text('switcher.nothing')}
          </p>
        ) : (
          <div
            id={listId}
            role="listbox"
            aria-label={text('switcher.title')}
            className="-mx-2 flex max-h-[320px] flex-col gap-[2px] overflow-y-auto px-2"
          >
            {rows.map((row, index) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the keys are heard by the field (combobox).
              <div
                key={rowId(index)}
                id={rowId(index)}
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                className={ROW}
                onMouseDown={(event) => event.preventDefault()} // the focus stays in the field
                onClick={() => onPick(row)}
              >
                <Place row={row} />
              </div>
            ))}
          </div>
        )}
        <p className={HINT}>{text('switcher.hint')}</p>
      </div>
    </Dialog>
  );
}

function Place({ row }: { row: SwitcherRow }) {
  const text = useText();
  if (row.kind === 'contact') {
    const { contact } = row;
    return (
      <>
        <Avatar name={contact.name} jid={contact.jid} avatarUrl={contact.avatarUrl} size={28} />
        <PresenceDot presence={contact.presence} />
        <span className="min-w-0 flex-1 truncate font-medium">{contact.name}</span>
        <span className="shrink-0 text-[12px] text-ink-muted">{text('switcher.newChat')}</span>
      </>
    );
  }
  const { chat } = row;
  return (
    <>
      {chat.kind === 'room' ? (
        <Users size={18} className="w-[28px] shrink-0 text-ink-muted" aria-hidden />
      ) : (
        <Avatar name={chat.title} jid={chat.peerJid} size={28} />
      )}
      <span
        className={`min-w-0 flex-1 truncate ${chat.unreadCount > 0 ? 'font-bold' : 'font-medium'}`}
      >
        {chat.title}
      </span>
      {chat.unreadCount > 0 && (
        <span className="shrink-0 text-[12px] text-ink-muted">
          {text('switcher.unread').replace('{count}', String(chat.unreadCount))}
        </span>
      )}
    </>
  );
}
