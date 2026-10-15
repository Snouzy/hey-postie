import type { Account, Chat, Contact } from '@hey-postie/core';
import { useEffect, useRef, useState } from 'react';
import { AddContact } from '../components/AddContact';
import { Conversation } from '../components/Conversation';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';
import { Details } from '../components/Details';
import { JoinRoom } from '../components/JoinRoom';
import { NewChat } from '../components/NewChat';
import { RoomDetails } from '../components/RoomDetails';
import { Sidebar } from '../components/Sidebar';
import { useCore, useText } from '../core/CoreProvider';
import { useChats } from '../core/useChats';
import { useContacts } from '../core/useContacts';
import { useCoreEvent } from '../core/useCoreEvent';
import { roomChat, useRooms, withRooms } from '../core/useRooms';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import styles from './Main.module.css';

interface MainProps {
  account: Account;
  onOpenLink: (url: string) => void;
  /** After sign out: back to the welcome screen, or straight to the sign-in form. */
  onLeave: (door: 'welcome' | 'signIn') => void;
}

type OpenDialog = 'newChat' | 'joinRoom' | 'addContact' | 'deleteAccount' | null;

/** The three columns. Owns the selection and tells the notifications service what is on screen. */
export function Main({ account, onOpenLink, onLeave }: MainProps) {
  const core = useCore();
  const text = useText();
  const { chats: directChats, refresh } = useChats();
  const { rooms, refresh: refreshRooms } = useRooms();
  const contacts = useContacts();
  const [selected, setSelected] = useState<Chat | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The list is the fresh source once the chat is in it (title, unread count).
  const chats = withRooms(directChats, rooms);
  const chat = selected ? (chats.find((c) => c.id === selected.id) ?? selected) : null;
  const contact = chat ? contacts.find((c) => c.jid === chat.peerJid) : undefined;
  const room = chat?.kind === 'room' ? rooms.find((r) => r.jid === chat.id) : undefined;
  const chatId = chat?.id ?? null;

  useEffect(() => {
    core.notifications.setOpenChat(chatId);
    if (chatId) core.chats.markRead(chatId).catch(() => {});
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

  // A notification click or an `xmpp:` link asks for a chat, by id (the bare JID for a direct chat).
  useCoreEvent('chat.requested', ({ chatId: requested }) => {
    const known = chats.find((c) => c.id === requested);
    if (known) setSelected(known);
    else void openWith(requested);
  });

  async function openWith(jid: string) {
    try {
      const opened = await core.chats.open(jid);
      await refresh();
      setSelected(opened);
      setDialog(null);
      setError(null);
    } catch (caught) {
      setError(errorKey(caught));
    }
  }

  function closeDialog() {
    setDialog(null);
    setError(null);
  }

  async function leave(door: 'welcome' | 'signIn') {
    try {
      await core.accounts.signOut();
      onLeave(door);
    } catch (caught) {
      setError(errorKey(caught));
    }
  }

  return (
    <div className={styles.main}>
      <Sidebar
        account={account}
        chats={chats}
        rooms={rooms}
        contacts={contacts}
        selectedChatId={chatId}
        searchRef={searchRef}
        error={dialog ? null : error}
        onSelectChat={setSelected}
        onSelectContact={(c: Contact) => void openWith(c.jid)}
        onNewChat={() => setDialog('newChat')}
        onJoinRoom={() => setDialog('joinRoom')}
        onAddContact={() => setDialog('addContact')}
        onSignOut={() => void leave('welcome')}
        onDeleteAccount={() => setDialog('deleteAccount')}
        onSignInAgain={() => void leave('signIn')}
      />
      {chat ? (
        <Conversation
          // A new key per chat: the draft, the loaded messages and in-flight work stay with their chat.
          key={chat.id}
          chat={chat}
          contact={contact}
          room={room}
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
      {chat?.kind === 'direct' && detailsOpen && (
        <Details chat={chat} onClose={() => setDetailsOpen(false)} />
      )}
      {room && detailsOpen && (
        <RoomDetails
          key={room.jid}
          room={room}
          onChanged={refreshRooms}
          onClose={() => setDetailsOpen(false)}
          onLeft={() => {
            setSelected(null);
            setDetailsOpen(false);
          }}
        />
      )}
      {dialog === 'newChat' && (
        <NewChat error={error} onOpen={(jid) => void openWith(jid)} onClose={closeDialog} />
      )}
      {dialog === 'joinRoom' && (
        <JoinRoom
          account={account}
          onJoined={(joined) => {
            setSelected(roomChat(joined));
            closeDialog();
          }}
          onClose={closeDialog}
        />
      )}
      {dialog === 'addContact' && <AddContact onClose={closeDialog} />}
      {dialog === 'deleteAccount' && (
        <DeleteAccountDialog
          jid={account.jid}
          onClose={closeDialog}
          onDeleted={() => onLeave('welcome')}
        />
      )}
    </div>
  );
}
