import type { Account, Chat, Contact, Room } from '@hey-postie/core';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AddContact } from '../components/AddContact';
import type { SaveFile } from '../components/Attachments';
import { Conversation } from '../components/Conversation';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';
import { DetailsPane } from '../components/DetailsPane';
import { EmptyState } from '../components/EmptyState';
import { JoinRoom } from '../components/JoinRoom';
import { LeaveRoomDialog } from '../components/LeaveRoomDialog';
import { Licenses } from '../components/Licenses';
import { MessageRequest } from '../components/MessageRequest';
import { MyDevices } from '../components/MyDevices';
import { NewChat } from '../components/NewChat';
import { PaneResizer } from '../components/PaneResizer';
import { Sidebar } from '../components/Sidebar';
import { SettingsWindow } from '../components/settings/SettingsWindow';
import type { SettingsSection } from '../components/settings/sections';
import { WelcomeCard } from '../components/WelcomeCard';
import { useCore, useText } from '../core/CoreProvider';
import { DETAILS_BOUNDS, readWelcomed, SIDEBAR_BOUNDS, writeWelcomed } from '../core/settings';
import { useChats } from '../core/useChats';
import { useContacts } from '../core/useContacts';
import { useCoreEvent } from '../core/useCoreEvent';
import { usePaneSizes } from '../core/usePaneSizes';
import { isRequest, type RequestRow, useRequests } from '../core/useRequests';
import { roomChat, useRooms, withRooms } from '../core/useRooms';
import { useUploads } from '../core/useUploads';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';

/*
 * Zoomed past the minimum window, the columns scroll sideways rather than squash or clip.
 * Never up or down: only the lists scroll that way (ui.md, "What scrolls"). A column that
 * outgrew the window would otherwise let a focus() or a scrollIntoView() shift the whole screen.
 */
const COLUMNS = 'flex h-full overflow-x-auto overflow-y-hidden';
const EMPTY = 'flex flex-1 flex-col items-center justify-center p-8';

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
  const [requestJid, setRequestJid] = useState<string | null>(null); // the open message request
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
  const mainRef = useRef<HTMLDivElement>(null);
  const panes = usePaneSizes();
  const { sidebarCollapsed } = panes.sizes;

  // The list is the fresh source once the chat is in it (title, unread count).
  const chats = withRooms(directChats, rooms);
  const requests = useRequests(chats);
  const selectedChat = selected ? (chats.find((c) => c.id === selected.id) ?? selected) : null;
  // A stranger's chat shows the request screen, even if their letter came while it was open.
  const wanted =
    requestJid ?? (selectedChat && isRequest(selectedChat) ? selectedChat.peerJid : null);
  const request = wanted ? requests.rows.find((row) => row.jid === wanted) : undefined;
  const chat = request ? null : selectedChat;
  const contact = chat ? contacts.find((c) => c.jid === chat.peerJid) : undefined;
  const room = chat?.kind === 'room' ? rooms.find((r) => r.jid === chat.id) : undefined;
  const chatId = chat?.id ?? request?.chat?.id ?? null;

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
        // A folded sidebar opens first: the field has to be on screen to take the focus.
        if (sidebarCollapsed) flushSync(() => panes.update({ sidebarCollapsed: false }));
        searchRef.current?.focus({ preventScroll: true });
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault();
        panes.update({ sidebarCollapsed: !sidebarCollapsed });
      } else if (event.key === 'Escape' && !dialog) {
        // An open dialog takes Esc for itself (see Dialog).
        setDetailsOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, sidebarCollapsed, panes.update]);

  // A notification click or an `xmpp:` link asks for a chat, by id (the bare JID for a direct chat).
  useCoreEvent('chat.requested', ({ chatId: requested }) => {
    const known = chats.find((c) => c.id === requested);
    if (known) select(known);
    else void openWith(requested);
  });

  /** A chat from the list, or a stranger's chat that belongs to the requests group. */
  function select(next: Chat) {
    setRequestJid(isRequest(next) ? next.peerJid : null);
    setSelected(next);
  }

  function selectRequest(row: RequestRow) {
    setRequestJid(row.jid);
    setSelected(null);
  }

  async function openWith(jid: string) {
    try {
      const opened = await core.chats.open(jid);
      await refresh();
      select(opened);
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
    <div
      ref={mainRef}
      className={COLUMNS}
      style={
        {
          '--sidebar-width': `${panes.sizes.sidebar}px`,
          '--details-width': `${panes.sizes.details}px`,
        } as CSSProperties
      }
    >
      <Sidebar
        id="sidebar"
        collapsed={sidebarCollapsed}
        account={account}
        chats={chats}
        rooms={rooms}
        contacts={contacts}
        requests={requests.rows}
        selectedChatId={chat?.id ?? null}
        selectedRequestJid={request?.jid ?? null}
        searchRef={searchRef}
        error={dialog ? null : error}
        onSelectChat={select}
        onSelectContact={(c: Contact) => void openWith(c.jid)}
        onSelectRequest={selectRequest}
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
      <PaneResizer
        pane="left"
        bounds={SIDEBAR_BOUNDS}
        width={panes.sizes.sidebar}
        collapsed={sidebarCollapsed}
        target={mainRef}
        variable="--sidebar-width"
        controls="sidebar"
        label={text('main.resizeSidebar')}
        onResize={(sidebar) => panes.update({ sidebar })}
        onCollapse={() => panes.update({ sidebarCollapsed: true })}
        onExpand={() => panes.update({ sidebarCollapsed: false })}
      />
      <main className="flex min-w-[320px] flex-1 flex-col">
        {request ? (
          <MessageRequest
            key={request.jid}
            row={request}
            // Accepted: the service put them in the address book; open the chat as a normal one.
            onAccepted={(jid) => void openWith(jid)}
            onIgnored={(jid) => {
              requests.hide(jid);
              setRequestJid(null);
              setSelected(null);
            }}
            onBlocked={(jid) => {
              requests.hide(jid);
              void requests.refresh().catch(() => {});
              setRequestJid(null);
              setSelected(null);
            }}
            onOpenLink={onOpenLink}
            onSaveFile={onSaveFile}
          />
        ) : chat ? (
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
          <section className={EMPTY}>
            <WelcomeCard onDismiss={dismissWelcome} />
          </section>
        ) : (
          <section className={EMPTY}>
            <EmptyState
              size="full"
              illustration={<Postie mood="waving" label={text('postie.alt.waving')} />}
              title={text('main.emptyTitle')}
              sentence={text('main.empty')}
            />
          </section>
        )}
      </main>
      {chat && detailsOpen && (
        <>
          <PaneResizer
            pane="right"
            bounds={DETAILS_BOUNDS}
            width={panes.sizes.details}
            collapsed={false}
            target={mainRef}
            variable="--details-width"
            controls="details"
            label={text('main.resizeDetails')}
            onResize={(details) => panes.update({ details })}
            // Folding the details is closing them: the header's button opens them again.
            onCollapse={() => setDetailsOpen(false)}
            onExpand={() => {}}
          />
          {/* Only an id for the resizer's `aria-controls`: the pane inside keeps its own width and borders. */}
          <div id="details" className="contents">
            <DetailsPane
              chat={chat}
              contact={contact}
              room={room}
              focusRequest={encryptionFocus}
              onClose={() => setDetailsOpen(false)}
              onRoomsChanged={refreshRooms}
              onLeft={() => {
                setSelected(null);
                setDetailsOpen(false);
              }}
            />
          </div>
        </>
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
        <NewChat
          account={account}
          contacts={contacts}
          rooms={rooms}
          error={error}
          onOpen={(jid) => void openWith(jid)}
          onJoined={(joined) => {
            setSelected(roomChat(joined));
            closeDialog();
          }}
          onClose={closeDialog}
        />
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
