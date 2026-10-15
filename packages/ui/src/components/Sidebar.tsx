import type { Account, Chat, Contact } from '@hey-postie/core';
import { LogOut, Plus, Search, UserPlus } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import { ChatList } from './ChatList';
import { ContactList } from './ContactList';
import { PresenceDot } from './PresenceDot';
import styles from './Sidebar.module.css';

export type SidebarTab = 'chats' | 'contacts';

interface SidebarProps {
  account: Account;
  chats: Chat[];
  contacts: Contact[];
  selectedChatId: string | null;
  searchRef: RefObject<HTMLInputElement | null>;
  onSelectChat: (chat: Chat) => void;
  onSelectContact: (contact: Contact) => void;
  onNewChat: () => void;
  onAddContact: () => void;
  onSignOut: () => void;
}

/** The left column: who is signed in, a search, the chats or the address book. */
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
        <PresenceDot presence="online" />
        <span className={styles.accountName}>{props.account.displayName}</span>
        <Button variant="ghost" onClick={props.onSignOut} aria-label={text('main.signOut')}>
          <LogOut size={18} aria-hidden />
        </Button>
      </header>

      <div className={styles.tabs} role="tablist">
        {(['chats', 'contacts'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === name}
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
