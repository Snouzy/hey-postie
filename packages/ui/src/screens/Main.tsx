import type { Account, Contact, Draft, Room } from '@hey-postie/core';
import { type CSSProperties, useCallback, useRef, useState } from 'react';
import type { SaveFile } from '../components/Attachments';
import { Conversation } from '../components/Conversation';
import { EmptyState } from '../components/EmptyState';
import { HallInvitation } from '../components/HallInvitation';
import { InviteToRoom } from '../components/InviteToRoom';
import { LeaveRoomDialog } from '../components/LeaveRoomDialog';
import { MessageRequest } from '../components/MessageRequest';
import { PaneResizer } from '../components/PaneResizer';
import { Sidebar } from '../components/Sidebar';
import { WelcomeCard } from '../components/WelcomeCard';
import { useCore, useText } from '../core/CoreProvider';
import { SIDEBAR_BOUNDS } from '../core/settings';
import { useChats } from '../core/useChats';
import { useContacts } from '../core/useContacts';
import { useCoreEvent } from '../core/useCoreEvent';
import { useInvitations } from '../core/useInvitations';
import { usePaneSizes } from '../core/usePaneSizes';
import { useRequests } from '../core/useRequests';
import { roomChat, useRooms, withRooms } from '../core/useRooms';
import { useUploads } from '../core/useUploads';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import { DetailsColumn } from './DetailsColumn';
import { MainDialogs } from './MainDialogs';
import { useDetails } from './useDetails';
import { useMainDialogs } from './useMainDialogs';
import { useMainSelection } from './useMainSelection';
import { useMainShortcuts } from './useMainShortcuts';
import { useNotificationFocus } from './useNotificationFocus';
import { useWelcome } from './useWelcome';

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

/** The three columns. Owns the selection and tells the notifications service what is on screen. */
export function Main({ account, onOpenLink, onSaveFile, onLeave }: MainProps) {
  const core = useCore();
  const text = useText();
  const { chats: directChats, refresh } = useChats();
  const { rooms, refresh: refreshRooms } = useRooms();
  const contacts = useContacts();
  const uploads = useUploads();
  const dialogs = useMainDialogs();
  const [inviteTo, setInviteTo] = useState<Room | null>(null); // the hall people are invited to
  const [leavingRoom, setLeavingRoom] = useState<Room | null>(null); // from a room row's menu
  const details = useDetails();
  const [error, setError] = useState<MessageKey | null>(null);
  // A letter Claude prepared; `chat.requested` (emitted right after) opens its chat.
  const [draft, setDraft] = useState<Draft | null>(null);
  const { welcoming, dismissWelcome } = useWelcome(account.jid);
  const mainRef = useRef<HTMLDivElement>(null);
  const panes = usePaneSizes();
  const { sidebarCollapsed } = panes.sizes;

  const chats = withRooms(directChats, rooms);
  const requests = useRequests(chats);
  const invitations = useInvitations();
  const selection = useMainSelection(chats, requests.rows, invitations.invitations);
  const { chat, request, invitation, select } = selection;
  const contact = chat ? contacts.find((c) => c.jid === chat.peerJid) : undefined;
  const room = chat?.kind === 'room' ? rooms.find((r) => r.jid === chat.id) : undefined;
  const chatId = chat?.id ?? request?.chat?.id ?? null;

  useNotificationFocus(chatId);
  useMainShortcuts({
    dialog: dialogs.dialog,
    openDialog: dialogs.open,
    sidebarCollapsed,
    updatePanes: panes.update,
    closeDetails: details.close,
  });

  useCoreEvent('assistant.draft', setDraft);
  const takeDraft = useCallback(() => setDraft(null), []);

  // A notification click or an `xmpp:` link asks for a chat, by id (the bare JID for a direct chat).
  useCoreEvent('chat.requested', ({ chatId: requested }) => {
    const known = chats.find((c) => c.id === requested);
    if (known) select(known);
    else void openWith(requested);
  });

  // A hall destroyed (by its owner, here or elsewhere) is no place to stay in.
  useCoreEvent('room.destroyed', ({ jid }) => {
    if (selection.selected?.id === jid) {
      selection.deselect();
      details.close();
    }
    if (inviteTo?.jid === jid) setInviteTo(null);
  });

  /** A hall just created or joined: open it. */
  function openRoom(room: Room) {
    select(roomChat(room));
  }

  async function openWith(jid: string) {
    try {
      const opened = await core.chats.open(jid);
      await refresh();
      select(opened);
      dialogs.open(null);
      setError(null);
    } catch (caught) {
      setError(errorKey(caught));
    }
  }

  function closeDialog() {
    dialogs.close();
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
        invitations={invitations.invitations}
        selectedChatId={chat?.id ?? null}
        selectedRequestJid={request?.jid ?? null}
        selectedInvitationJid={invitation?.roomJid ?? null}
        error={dialogs.dialog ? null : error}
        onSelectChat={select}
        onSelectContact={(c: Contact) => void openWith(c.jid)}
        onSelectRequest={selection.selectRequest}
        onSelectInvitation={selection.selectInvitation}
        onLeaveRoom={setLeavingRoom}
        onNewChat={() => dialogs.open('newChat')}
        onCreateRoom={() => dialogs.open('createRoom')}
        onJoinRoom={() => dialogs.open('joinRoom')}
        onBrowseRooms={() => dialogs.open('browseRooms')}
        onAddContact={() => dialogs.open('addContact')}
        onMyDevices={() => dialogs.open('myDevices')}
        onSettings={() => dialogs.open('settings')}
        onSignOut={() => void leave('welcome')}
        onDeleteAccount={() => dialogs.open('deleteAccount')}
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
              selection.closeRequest();
            }}
            onBlocked={(jid) => {
              requests.hide(jid);
              void requests.refresh().catch(() => {});
              selection.closeRequest();
            }}
            onOpenLink={onOpenLink}
            onSaveFile={onSaveFile}
          />
        ) : invitation ? (
          <HallInvitation
            key={invitation.roomJid}
            invitation={invitation}
            contacts={contacts}
            onJoined={(joined) => {
              invitations.refresh();
              openRoom(joined);
            }}
            onDeclined={() => {
              invitations.refresh();
              selection.closeInvitation();
            }}
          />
        ) : chat ? (
          <Conversation
            // A new key per chat: the draft, the loaded messages and in-flight work stay with their chat.
            key={chat.id}
            chat={chat}
            contact={contact}
            room={room}
            detailsOpen={details.open}
            onToggleDetails={() => details.show()}
            onOpenPeople={() => details.show('people')}
            onOpenEncryption={() => details.show('encryption')}
            onOpenLink={onOpenLink}
            onSaveFile={onSaveFile}
            uploads={uploads.forChat(chat.id)}
            draft={draft?.chatId === chat.id ? draft.body : undefined}
            onDraftTaken={takeDraft}
            onInvite={room ? () => setInviteTo(room) : undefined}
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
      {chat && details.open && (
        <DetailsColumn
          chat={chat}
          contact={contact}
          room={room}
          width={panes.sizes.details}
          target={mainRef}
          onResize={(width) => panes.update({ details: width })}
          encryptionFocus={details.encryptionFocus}
          peopleFocus={details.peopleFocus}
          onClose={details.close}
          onRoomsChanged={refreshRooms}
          onLeft={() => {
            selection.deselect();
            details.close();
          }}
          onInvite={room ? () => setInviteTo(room) : undefined}
        />
      )}
      {leavingRoom && (
        <LeaveRoomDialog
          room={leavingRoom}
          onClose={() => setLeavingRoom(null)}
          onLeft={() => {
            if (chatId === leavingRoom.jid) {
              selection.deselect();
              details.close();
            }
            setLeavingRoom(null);
          }}
        />
      )}
      {/* Before the invite dialog, as before the split: a shortcut opens these under it. */}
      <MainDialogs
        account={account}
        dialogs={dialogs}
        chats={chats}
        contacts={contacts}
        rooms={rooms}
        error={error}
        onClose={closeDialog}
        onSelect={select}
        onOpenWith={(jid) => void openWith(jid)}
        onOpenRoom={openRoom}
        onInvite={setInviteTo}
        onSignOut={() => void leave('welcome')}
        onDeleted={() => onLeave('welcome')}
        onOpenLink={onOpenLink}
      />
      {inviteTo && (
        <InviteToRoom room={inviteTo} contacts={contacts} onClose={() => setInviteTo(null)} />
      )}
    </div>
  );
}
