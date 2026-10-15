import type { Account, Chat, Contact } from '@hey-postie/core';
import { useEffect, useRef, useState } from 'react';
import { AddContact } from '../components/AddContact';
import { Conversation } from '../components/Conversation';
import { Details } from '../components/Details';
import { NewChat } from '../components/NewChat';
import { Sidebar } from '../components/Sidebar';
import { useCore, useText } from '../core/CoreProvider';
import { useChats } from '../core/useChats';
import { useContacts } from '../core/useContacts';
import { Postie } from '../illustrations/Postie';
import styles from './Main.module.css';

interface MainProps {
  account: Account;
  onOpenLink: (url: string) => void;
  onSignedOut: () => void;
}

type OpenDialog = 'newChat' | 'addContact' | null;

/** The three columns. Owns the selection and tells the notifications service what is on screen. */
export function Main({ account, onOpenLink, onSignedOut }: MainProps) {
  const core = useCore();
  const text = useText();
  const { chats, refresh } = useChats();
  const contacts = useContacts();
  const [selected, setSelected] = useState<Chat | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // The list is the fresh source once the chat is in it (title, unread count).
  const chat = selected ? (chats.find((c) => c.id === selected.id) ?? selected) : null;
  const contact = chat ? contacts.find((c) => c.jid === chat.peerJid) : undefined;
  const chatId = chat?.id ?? null;

  useEffect(() => {
    core.notifications.setOpenChat(chatId);
    if (chatId) void core.chats.markRead(chatId);
  }, [core, chatId]);

  useEffect(() => {
    const focus = () => core.notifications.setWindowFocused(true);
    const blur = () => core.notifications.setWindowFocused(false);
    window.addEventListener('focus', focus);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', blur);
    };
  }, [core]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'Escape' && !dialog) {
        // An open dialog takes Esc for itself (see Dialog).
        setDetailsOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog]);

  async function openWith(jid: string) {
    const opened = await core.chats.open(jid);
    await refresh();
    setSelected(opened);
    setDialog(null);
  }

  async function signOut() {
    await core.accounts.signOut();
    onSignedOut();
  }

  return (
    <div className={styles.main}>
      <Sidebar
        account={account}
        chats={chats}
        contacts={contacts}
        selectedChatId={chat?.id ?? null}
        searchRef={searchRef}
        onSelectChat={setSelected}
        onSelectContact={(c: Contact) => void openWith(c.jid)}
        onNewChat={() => setDialog('newChat')}
        onAddContact={() => setDialog('addContact')}
        onSignOut={() => void signOut()}
      />
      {chat ? (
        <Conversation
          chat={chat}
          contact={contact}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((open) => !open)}
          onOpenLink={onOpenLink}
        />
      ) : (
        <section className={styles.empty}>
          <Postie mood="asleep" label={text('postie.alt.asleep')} />
          <p className={styles.emptyText}>{text('main.empty')}</p>
        </section>
      )}
      {chat && detailsOpen && <Details chat={chat} onClose={() => setDetailsOpen(false)} />}
      {dialog === 'newChat' && (
        <NewChat
          onOpened={(opened) => void openWith(opened.peerJid)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'addContact' && <AddContact onClose={() => setDialog(null)} />}
    </div>
  );
}
