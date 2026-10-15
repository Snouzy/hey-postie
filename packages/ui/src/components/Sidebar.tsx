import type { Account, Chat, Contact } from '@hey-postie/core';
import { Plus, Search, UserPlus } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { AccountMenu } from './AccountMenu';
import { Button } from './Button';
import { ChatList } from './ChatList';
import { ContactList } from './ContactList';
import styles from './Sidebar.module.css';

export type SidebarTab = 'chats' | 'contacts';

interface SidebarProps {
  account: Account;
  chats: Chat[];
  contacts: Contact[];
  selectedChatId: string | null;
  searchRef: RefObject<HTMLInputElement | null>;
  /** A failed background action (sign out, opening a chat), in Postie's words. */
  error: MessageKey | null;
  onSelectChat: (chat: Chat) => void;
  onSelectContact: (contact: Contact) => void;
  onNewChat: () => void;
  onAddContact: () => void;
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
        {tab === 'chats' ? (
          <Button variant="ghost" onClick={props.onNewChat} aria-label={text('main.newChat')}>
            <Plus size={18} aria-hidden />
          </Button>
        ) : (
          <Button variant="ghost" onClick={props.onAddContact} aria-label={text('main.addContact')}>
            <UserPlus size={18} aria-hidden />
          </Button>
        )}
      </div>

      <div className={styles.body}>
        {tab === 'chats' ? (
          <ChatList chats={chats} selectedId={props.selectedChatId} onSelect={props.onSelectChat} />
        ) : (
          <ContactList contacts={contacts} onSelect={props.onSelectContact} />
        )}
      </div>
    </nav>
  );
}
