import type { Account, Chat, Contact, Room } from '@hey-postie/core';
import { useEffect, useRef, useState } from 'react';
import { AddContact } from '../components/AddContact';
import type { SaveFile } from '../components/Attachments';
import { Conversation } from '../components/Conversation';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';
import { DetailsPane } from '../components/DetailsPane';
import { EmptyState } from '../components/EmptyState';
import { JoinRoom } from '../components/JoinRoom';
import { LeaveRoomDialog } from '../components/LeaveRoomDialog';
import { Licenses } from '../components/Licenses';
import { MyDevices } from '../components/MyDevices';
import { NewChat } from '../components/NewChat';
import { Sidebar } from '../components/Sidebar';
import { SettingsWindow } from '../components/settings/SettingsWindow';
import type { SettingsSection } from '../components/settings/sections';
import { WelcomeCard } from '../components/WelcomeCard';
import { useCore, useText } from '../core/CoreProvider';
import { readWelcomed, writeWelcomed } from '../core/settings';
import { useChats } from '../core/useChats';
import { useContacts } from '../core/useContacts';
import { useCoreEvent } from '../core/useCoreEvent';
import { roomChat, useRooms, withRooms } from '../core/useRooms';
import { useUploads } from '../core/useUploads';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import styles from './Main.module.css';

interface MainProps {
  account: Account;
  onOpenLink: (url: string) => void;
  onSaveFile: SaveFile;
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
export function Main({ account, onOpenLink, onSaveFile, onLeave }: MainProps) {
  const core = useCore();
  const text = useText();
  const { chats: directChats, refresh } = useChats();
  const { rooms, refresh: refreshRooms } = useRooms();
  const contacts = useContacts();
  const uploads = useUploads();
  const [selected, setSelected] = useState<Chat | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [leavingRoom, setLeavingRoom] = useState<Room | null>(null); // from a room row's menu
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  // The settings window is behind the open dialog, and comes back with the focus on that button.
  const [settingsBehind, setSettingsBehind] = useState<'licenses' | 'deleteAccount' | null>(null);
  const [returnFocus, setReturnFocus] = useState<'licenses' | 'deleteAccount' | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [encryptionFocus, setEncryptionFocus] = useState(0); // "Check their devices" requests
  const [error, setError] = useState<MessageKey | null>(null);
  // The first-launch card: once per account, and only for an empty address book.
  const [welcoming, setWelcoming] = useState(false);
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
    if (readWelcomed(account.jid)) return;
    let cancelled = false;
    core.contacts
      .list()
      .then((list) => !cancelled && list.length === 0 && setWelcoming(true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [core, account.jid]);

  function dismissWelcome() {
    writeWelcomed(account.jid);
    setWelcoming(false);
  }

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
    setSettingsSection('general');
    setSettingsBehind(null);
    setReturnFocus(null);
    setError(null);
  }

  /** Opens a dialog in place of the settings window; closing it reopens the window. */
  function fromSettings(next: 'licenses' | 'deleteAccount') {
    setSettingsBehind(next);
    setDialog(next);
  }

  function backToSettings() {
    setReturnFocus(settingsBehind);
    setSettingsBehind(null);
    setDialog('settings');
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
        onLeaveRoom={setLeavingRoom}
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
          onSaveFile={onSaveFile}
          uploads={uploads.forChat(chat.id)}
        />
      ) : welcoming ? (
        <section className={styles.empty}>
          <WelcomeCard onDismiss={dismissWelcome} />
        </section>
      ) : (
        <section className={styles.empty}>
          <EmptyState
            size="full"
            illustration={<Postie mood="waving" label={text('postie.alt.waving')} />}
            title={text('main.emptyTitle')}
            sentence={text('main.empty')}
          />
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
      {leavingRoom && (
        <LeaveRoomDialog
          room={leavingRoom}
          onClose={() => setLeavingRoom(null)}
          onLeft={() => {
            if (chatId === leavingRoom.jid) {
              setSelected(null);
              setDetailsOpen(false);
            }
            setLeavingRoom(null);
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
        <SettingsWindow
          account={account}
          section={settingsSection}
          onSelectSection={setSettingsSection}
          onClose={closeDialog}
          onSignOut={() => void leave('welcome')}
          onDeleteAccount={() => fromSettings('deleteAccount')}
          onLicenses={() => fromSettings('licenses')}
          onOpenLink={onOpenLink}
          returnFocus={returnFocus}
        />
      )}
      {dialog === 'licenses' && <Licenses onClose={backToSettings} onOpenLink={onOpenLink} />}
      {dialog === 'deleteAccount' && (
        <DeleteAccountDialog
          jid={account.jid}
          onClose={settingsBehind ? backToSettings : closeDialog}
          onDeleted={() => onLeave('welcome')}
        />
      )}
    </div>
  );
}
