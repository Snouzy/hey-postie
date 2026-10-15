import type { Account, Chat, Contact } from '@hey-postie/core';
import { useEffect, useRef, useState } from 'react';
import { AddContact } from '../components/AddContact';
import { Conversation } from '../components/Conversation';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';
import { DetailsPane } from '../components/DetailsPane';
import { JoinRoom } from '../components/JoinRoom';
import { Licenses } from '../components/Licenses';
import { MyDevices } from '../components/MyDevices';
import { NewChat } from '../components/NewChat';
import { Settings } from '../components/Settings';
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

type OpenDialog =
  | 'newChat'
  | 'joinRoom'
  | 'addContact'
  | 'myDevices'
  | 'settings'
  | 'licenses'
  | 'deleteAccount'
  | null;

/** The three columns. Owns the selection and tells the notifications service what is on screen. */
export function Main({ account, onOpenLink, onLeave }: MainProps) {
  const core = useCore();
  const text = useText();
  const { chats: directChats, refresh } = useChats();
  const { rooms, refresh: refreshRooms } = useRooms();
  const contacts = useContacts();
  const [selected, setSelected] = useState<Chat | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [backFromLicenses, setBackFromLicenses] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [encryptionFocus, setEncryptionFocus] = useState(0); // "Check their devices" requests
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

  /** The header button toggles the pane; a sealed letter opens it on its Encryption section. */
  function showDetails(toEncryption: boolean) {
    setEncryptionFocus(toEncryption ? (count) => count + 1 : 0);
    setDetailsOpen(toEncryption || !detailsOpen);
  }

  function closeDialog() {
    setDialog(null);
    setBackFromLicenses(false);
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
        onMyDevices={() => setDialog('myDevices')}
        onSettings={() => setDialog('settings')}
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
          onToggleDetails={() => showDetails(false)}
          onOpenEncryption={() => showDetails(true)}
          onOpenLink={onOpenLink}
        />
      ) : (
        <section className={styles.empty}>
          <Postie mood="asleep" label={text('postie.alt.asleep')} />
          <p className={styles.emptyText}>{text('main.empty')}</p>
        </section>
      )}
      {chat && detailsOpen && (
        <DetailsPane
          chat={chat}
          room={room}
          focusRequest={encryptionFocus}
          onClose={() => setDetailsOpen(false)}
          onRoomsChanged={refreshRooms}
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
      {dialog === 'myDevices' && <MyDevices onClose={closeDialog} />}
      {dialog === 'settings' && (
        <Settings
          onClose={closeDialog}
          onLicenses={() => setDialog('licenses')}
          onOpenLink={onOpenLink}
          focusLicenses={backFromLicenses}
        />
      )}
      {dialog === 'licenses' && (
        <Licenses
          onClose={() => {
            setBackFromLicenses(true);
            setDialog('settings');
          }}
          onOpenLink={onOpenLink}
        />
      )}
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
