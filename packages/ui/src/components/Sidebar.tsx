import type { Account, Chat, Contact, Room } from '@hey-postie/core';
import { Search } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { AccountMenu } from './AccountMenu';
import { AddMenu } from './AddMenu';
import { Button } from './Button';
import { ChatList } from './ChatList';
import { ContactList } from './ContactList';
import styles from './Sidebar.module.css';

export type SidebarTab = 'chats' | 'contacts';

interface SidebarProps {
  account: Account;
  /** Direct chats and halls alike (`withRooms`). */
  chats: Chat[];
  rooms: Room[];
  contacts: Contact[];
  selectedChatId: string | null;
  searchRef: RefObject<HTMLInputElement | null>;
  /** A failed background action (sign out, opening a chat), in Postie's words. */
  error: MessageKey | null;
  onSelectChat: (chat: Chat) => void;
  onSelectContact: (contact: Contact) => void;
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
  const needle = query.trim().toLowerCase();
  const chats = needle
    ? props.chats.filter((chat) => chat.title.toLowerCase().includes(needle))
    : props.chats;
  const contacts = needle
    ? props.contacts.filter((contact) => contact.name.toLowerCase().includes(needle))
    : props.contacts;

  return (
    <nav className={styles.sidebar}>
      <header className={styles.account}>
        <AccountMenu
          account={props.account}
          onSignOut={props.onSignOut}
          onMyDevices={props.onMyDevices}
          onSettings={props.onSettings}
          onDeleteAccount={props.onDeleteAccount}
        />
      </header>

      {props.account.state === 'connecting' && (
        <p className={styles.banner} role="status">
          {text('banner.reconnecting')}
        </p>
      )}
      {(props.account.state === 'offline' || props.account.state === 'error') && (
        <div className={styles.banner} data-tone="error" role="alert">
          {text('banner.offline')}
          <Button onClick={props.onSignInAgain}>{text('banner.signInAgain')}</Button>
        </div>
      )}
      {props.error && (
        <p className={styles.banner} data-tone="error" role="alert">
          {text(props.error)}
        </p>
      )}

      <div className={styles.tabs}>
        {(['chats', 'contacts'] as const).map((name) => (
          <button
            key={name}
            type="button"
            className={styles.tab}
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {text(`main.tabs.${name}`)}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} aria-hidden />
          <input
            ref={props.searchRef}
            type="search"
            value={query}
            placeholder={text('main.search')}
            aria-label={text('main.search')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <AddMenu
          onNewChat={props.onNewChat}
          onJoinRoom={props.onJoinRoom}
          onAddContact={props.onAddContact}
        />
      </div>

      <div className={styles.body}>
        {tab === 'chats' ? (
          <ChatList
            chats={chats}
            rooms={props.rooms}
            selectedId={props.selectedChatId}
            onSelect={props.onSelectChat}
            onLeaveRoom={props.onLeaveRoom}
            onStartChat={props.onNewChat}
          />
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
