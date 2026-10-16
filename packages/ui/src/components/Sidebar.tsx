import type { Account, Chat, Contact, Room, RoomInvitation } from '@hey-postie/core';
import {
  DoorOpen,
  LayoutList,
  MessageSquarePlus,
  Plus,
  Search,
  SquarePlus,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { useText } from '../core/CoreProvider';
import { inviterName } from '../core/useInvitations';
import { isRequest, type RequestRow } from '../core/useRequests';
import type { MessageKey } from '../i18n';
import { AccountMenu } from './AccountMenu';
import { AddMenu } from './AddMenu';
import { Button } from './Button';
import { ChatList, moveWithArrows } from './ChatList';
import { ContactList } from './ContactList';
import { InvitationList } from './InvitationList';
import { RequestList } from './RequestList';
import { SidebarGroup } from './SidebarGroup';

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
/** The "+" of the Halls heading: shown while the heading is hovered or holds the focus, or open. */
const HALLS_ADD =
  'opacity-0 group-focus-within/heading:opacity-100 group-hover/heading:opacity-100 aria-expanded:opacity-100';
/** One muted line in an empty group (not while searching: the search empties groups on purpose). */
const GROUP_EMPTY = 'm-0 text-[13px] text-ink-muted';
const EMPTY_ACTION =
  'flex cursor-pointer items-center gap-1 rounded-sm border-none bg-transparent p-0 text-[13px] font-semibold text-navy hover:underline focus-visible:underline';
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
  /** Invitations to halls waiting for an answer. */
  invitations: RoomInvitation[];
  selectedChatId: string | null;
  selectedRequestJid: string | null;
  selectedInvitationJid: string | null;
  /** A failed background action (sign out, opening a chat), in Postie's words. */
  error: MessageKey | null;
  onSelectChat: (chat: Chat) => void;
  onSelectContact: (contact: Contact) => void;
  onSelectRequest: (row: RequestRow) => void;
  onSelectInvitation: (invitation: RoomInvitation) => void;
  /** "Leave the hall…" from a room row. */
  onLeaveRoom: (room: Room) => void;
  onNewChat: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  /** The Halls heading's "Browse halls": the join dialog, open on its directory. */
  onBrowseRooms: () => void;
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
  const invitations = needle
    ? props.invitations.filter((invitation) =>
        `${invitation.roomJid} ${inviterName(invitation, props.contacts)}`
          .toLowerCase()
          .includes(needle),
      )
    : props.invitations;
  const halls = chats.filter((chat) => chat.kind === 'room');
  const letters = chats.filter((chat) => chat.kind !== 'room');
  // Strangers or invitations waiting: the list is not empty to the reader.
  const nothing = chats.length === 0 && requests.length === 0 && invitations.length === 0;
  const createRoom = {
    label: text('main.createRoom'),
    icon: SquarePlus,
    action: props.onCreateRoom,
  };
  const joinRoom = { label: text('main.joinRoom'), icon: DoorOpen, action: props.onJoinRoom };
  const browseRooms = {
    label: text('main.browseRooms'),
    icon: LayoutList,
    action: props.onBrowseRooms,
  };

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
            className={SEARCH_INPUT}
            type="search"
            value={query}
            placeholder={text(searchKey)}
            aria-label={text(searchKey)}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <AddMenu
          label={text('main.add')}
          items={[
            { label: text('main.newChat'), icon: MessageSquarePlus, action: props.onNewChat },
            createRoom,
            joinRoom,
            { label: text('main.addContact'), icon: UserPlus, action: props.onAddContact },
          ]}
        />
      </div>

      {/* Each list moves its own rows with the arrows; at its end, this one moves to the next group. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: it hears the arrows of the row buttons inside; it takes no focus itself */}
      <div className="min-h-0 flex-1 overflow-y-auto" onKeyDown={moveWithArrows}>
        {tab === 'chats' ? (
          <>
            <RequestList
              rows={requests}
              selectedJid={props.selectedRequestJid}
              onSelect={props.onSelectRequest}
            />
            {nothing ? (
              <ChatList
                chats={[]}
                selectedId={null}
                onSelect={() => {}}
                onStartChat={props.onNewChat}
              />
            ) : (
              <>
                {invitations.length > 0 && (
                  <SidebarGroup
                    id="invitations"
                    title={text('sidebar.invitations')}
                    count={{ value: invitations.length, label: text('requests.waiting') }}
                  >
                    <InvitationList
                      invitations={invitations}
                      contacts={props.contacts}
                      selectedJid={props.selectedInvitationJid}
                      onSelect={props.onSelectInvitation}
                    />
                  </SidebarGroup>
                )}
                <SidebarGroup
                  id="halls"
                  title={text('sidebar.halls')}
                  folded={{ ...waiting(halls, props.rooms), label: text('sidebar.unreadChats') }}
                  action={
                    <AddMenu
                      label={text('sidebar.hallsAdd')}
                      items={[createRoom, browseRooms]}
                      size="small"
                      className={HALLS_ADD}
                    />
                  }
                >
                  {halls.length > 0 ? (
                    <ChatList
                      chats={halls}
                      rooms={props.rooms}
                      selectedId={props.selectedChatId}
                      onSelect={props.onSelectChat}
                      onLeaveRoom={props.onLeaveRoom}
                    />
                  ) : (
                    !needle && (
                      <EmptyGroup
                        sentence={text('sidebar.hallsEmpty')}
                        action={text('sidebar.hallsFirst')}
                        onAction={props.onCreateRoom}
                      />
                    )
                  )}
                </SidebarGroup>
                <SidebarGroup
                  id="letters"
                  title={text('sidebar.letters')}
                  folded={{ ...waiting(letters, []), label: text('sidebar.unreadChats') }}
                >
                  {letters.length > 0 ? (
                    <ChatList
                      chats={letters}
                      contacts={props.contacts}
                      selectedId={props.selectedChatId}
                      onSelect={props.onSelectChat}
                    />
                  ) : (
                    !needle && (
                      <EmptyGroup
                        sentence={text('sidebar.lettersEmpty')}
                        action={text('sidebar.lettersFirst')}
                        onAction={props.onNewChat}
                      />
                    )
                  )}
                </SidebarGroup>
              </>
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

/** An empty group says so in one muted line, with the one thing to do about it. */
function EmptyGroup({
  sentence,
  action,
  onAction,
}: {
  sentence: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-1 px-5 py-1">
      <p className={GROUP_EMPTY}>{sentence}</p>
      <button type="button" className={EMPTY_ACTION} onClick={onAction}>
        <Plus size={14} aria-hidden />
        {action}
      </button>
    </div>
  );
}

/** What waits in a group, for its folded heading: chats with unread letters, and any mention. */
function waiting(chats: Chat[], rooms: Room[]): { unread: number; mentions: number } {
  const unread = chats.filter((chat) => chat.unreadCount > 0).length;
  const mentions = rooms
    .filter((room) => chats.some((chat) => chat.id === room.jid))
    .reduce((sum, room) => sum + room.mentionsCount, 0);
  return { unread, mentions };
}
