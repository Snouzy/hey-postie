import type { Account, Chat, Contact, Room } from '@hey-postie/core';
import { Search } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { isRequest, type RequestRow } from '../core/useRequests';
import type { MessageKey } from '../i18n';
import { AccountMenu } from './AccountMenu';
import { AddMenu } from './AddMenu';
import { Button } from './Button';
import { ChatList } from './ChatList';
import { ContactList } from './ContactList';
import { RequestList } from './RequestList';

export type SidebarTab = 'chats' | 'contacts';

/**
 * Sized by the user (PaneResizer writes the variable), within the bounds of settings.ts. Folded,
 * it is `hidden`: `[&[hidden]]:hidden` keeps `flex` from winning over the attribute.
 */
const SIDEBAR =
  'flex w-[clamp(220px,var(--sidebar-width,300px),480px)] shrink-0 flex-col border-r border-line bg-paper [&[hidden]]:hidden';
const TAB =
  'flex-1 cursor-pointer border-0 border-b-2 border-b-transparent bg-transparent p-2 font-semibold text-ink-muted transition-[color,border-color] duration-(--motion-fast) aria-pressed:border-b-navy aria-pressed:text-navy';
/** The input's own ring is off (it would sit inside the pill): the pill wears it instead. */
const SEARCH =
  'flex flex-1 items-center gap-2 rounded-full border border-line-strong bg-paper-raised px-3 py-0 text-ink-muted focus-within:border-navy focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy';
const SEARCH_INPUT =
  'min-w-0 flex-1 border-none bg-transparent px-0 py-2 text-ink outline-none placeholder:overflow-hidden placeholder:text-ellipsis';
/** Connection banner: Postie speaks, so the heading font. */
const BANNER =
  "mx-3 my-0 flex flex-wrap items-center justify-between gap-2 rounded-sm bg-kraft-soft px-3 py-2 font-heading text-[14px] [font-variation-settings:'SOFT'_100] data-[tone=error]:text-red";

interface SidebarProps {
  id: string;
  /** Folded: hidden and inert, its state kept for when it opens again. */
  collapsed: boolean;
  account: Account;
  /** Direct chats and halls alike (`withRooms`). */
  chats: Chat[];
  rooms: Room[];
  contacts: Contact[];
  /** The message requests: strangers asking, or writing before asking. */
  requests: RequestRow[];
  selectedChatId: string | null;
  selectedRequestJid: string | null;
  searchRef: RefObject<HTMLInputElement | null>;
  /** A failed background action (sign out, opening a chat), in Postie's words. */
  error: MessageKey | null;
  onSelectChat: (chat: Chat) => void;
  onSelectContact: (contact: Contact) => void;
  onSelectRequest: (row: RequestRow) => void;
  /** "Leave the hall…" from a room row. */
  onLeaveRoom: (room: Room) => void;
  onNewChat: () => void;
  onJoinRoom: () => void;
  onAddContact: () => void;
  /** Opens the "My devices" dialog (own OMEMO keys). */
  onMyDevices: () => void;
  onSettings: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  onSignInAgain: () => void;
}

/** The left column: who is signed in and how the line is, a search, the chats or the address book. */
export function Sidebar(props: SidebarProps) {
  const text = useText();
  const [tab, setTab] = useState<SidebarTab>('chats');
  const [query, setQuery] = useState('');
  const searchKey = tab === 'chats' ? 'main.search' : 'main.searchContacts';
  const needle = query.trim().toLowerCase();
  // A stranger's chat waits in the requests group, not among the chats.
  const listed = props.chats.filter((chat) => !isRequest(chat));
  const chats = needle
    ? listed.filter((chat) => chat.title.toLowerCase().includes(needle))
    : listed;
  const requests = needle
    ? props.requests.filter((row) => row.name.toLowerCase().includes(needle))
    : props.requests;
  const contacts = needle
    ? props.contacts.filter((contact) => contact.name.toLowerCase().includes(needle))
    : props.contacts;

  return (
    <nav
      id={props.id}
      className={SIDEBAR}
      hidden={props.collapsed || undefined}
      inert={props.collapsed || undefined}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <AccountMenu
          account={props.account}
          onSignOut={props.onSignOut}
          onMyDevices={props.onMyDevices}
          onSettings={props.onSettings}
          onDeleteAccount={props.onDeleteAccount}
        />
      </header>

      {props.account.state === 'connecting' && (
        <p className={BANNER} role="status">
          {text('banner.reconnecting')}
        </p>
      )}
      {(props.account.state === 'offline' || props.account.state === 'error') && (
        <div className={BANNER} data-tone="error" role="alert">
          {text('banner.offline')}
          <Button onClick={props.onSignInAgain}>{text('banner.signInAgain')}</Button>
        </div>
      )}
      {props.error && (
        <p className={BANNER} data-tone="error" role="alert">
          {text(props.error)}
        </p>
      )}

      <div className="flex border-b border-line px-3 py-0">
        {(['chats', 'contacts'] as const).map((name) => (
          <button
            key={name}
            type="button"
            className={TAB}
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {text(`main.tabs.${name}`)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 p-3">
        <label className={SEARCH}>
          <Search size={16} aria-hidden />
          <input
            ref={props.searchRef}
            className={SEARCH_INPUT}
            type="search"
            value={query}
            placeholder={text(searchKey)}
            aria-label={text(searchKey)}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <AddMenu
          onNewChat={props.onNewChat}
          onJoinRoom={props.onJoinRoom}
          onAddContact={props.onAddContact}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'chats' ? (
          <>
            <RequestList
              rows={requests}
              selectedJid={props.selectedRequestJid}
              onSelect={props.onSelectRequest}
            />
            {/* Strangers waiting at the door: the list is not empty to the reader. */}
            {(chats.length > 0 || requests.length === 0) && (
              <ChatList
                chats={chats}
                rooms={props.rooms}
                contacts={props.contacts}
                selectedId={props.selectedChatId}
                onSelect={props.onSelectChat}
                onLeaveRoom={props.onLeaveRoom}
                onStartChat={props.onNewChat}
              />
            )}
          </>
        ) : (
          <ContactList
            contacts={contacts}
            onSelect={props.onSelectContact}
            onAddContact={props.onAddContact}
          />
        )}
      </div>
    </nav>
  );
}
