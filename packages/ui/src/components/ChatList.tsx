import type { Chat, Contact, Room } from '@hey-postie/core';
import { BellOff, Lock, Users } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import { formatRecent } from '../i18n/dates';
import { Postie } from '../illustrations/Postie';
import { cn } from '../lib/cn';
import { Avatar } from './Avatar';
import { EmptyState } from './EmptyState';
import { RoomRowMenu } from './RoomRowMenu';

const ROW =
  'flex w-full cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent px-3 py-2 text-left text-ink transition-[background-color] duration-(--motion-fast) hover:bg-fill-hover aria-[current=true]:bg-fill-chosen';
/** The top line (title, time) and the bottom one (preview, badge) beside the avatar. */
const LINE = 'flex w-full items-center justify-between gap-2';
const BADGE =
  'min-w-5 shrink-0 rounded-full px-[6px] py-0 text-center text-[12px] leading-[20px] font-bold';

interface ChatListProps {
  chats: Chat[];
  /** The halls, for their mentions count. */
  rooms?: Room[];
  /** The address book, for the avatars of direct chats. */
  contacts?: Contact[];
  selectedId: string | null;
  onSelect: (chat: Chat) => void;
  /** "Leave the hall…" from a room row's menu; without it, rows have no menu. */
  onLeaveRoom?: (room: Room) => void;
  /** "Start a chat" on the empty state; without it, the sentence alone. */
  onStartChat?: () => void;
}

/**
 * The sidebar list. Arrow keys move between rows; Enter or a click opens one. A hall the app has
 * a record of gets a "⋯" (hover or focus) and a right-click menu, both with "Leave the hall…".
 */
export function ChatList({
  chats,
  rooms = [],
  contacts = [],
  selectedId,
  onSelect,
  onLeaveRoom,
  onStartChat,
}: ChatListProps) {
  const text = useText();
  const locale = useLocale();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const roomOf = (chat: Chat) => rooms.find((room) => room.jid === chat.id);
  const avatarOf = (chat: Chat) =>
    chat.kind === 'direct'
      ? contacts.find((contact) => contact.jid === chat.peerJid)?.avatarUrl
      : undefined;

  if (chats.length === 0) {
    return (
      <EmptyState
        illustration={<Postie mood="writing" label={text('postie.alt.writing')} size={96} />}
        title={text('chatList.empty')}
        sentence={text('chatList.emptyHint')}
        action={onStartChat && { label: text('chatList.startChat'), onClick: onStartChat }}
      />
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-[2px] px-2 py-0" onKeyDown={moveWithArrows}>
      {chats.map((chat) => {
        const record = chat.kind === 'room' ? roomOf(chat) : undefined;
        const room = onLeaveRoom ? record : undefined;
        const muted = record?.notify === 'none';
        return (
          // A row with a menu: the "⋯" (RoomRowMenu) sits over the time's corner.
          <li key={chat.id} className="group/row relative">
            <button
              type="button"
              data-row=""
              // A hall whose bell never rings steps back: half ink, a bell-off after its name.
              className={cn(ROW, muted && 'opacity-50')}
              aria-current={chat.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(chat)}
              onContextMenu={
                room
                  ? (event) => {
                      event.preventDefault();
                      setMenuFor(chat.id);
                    }
                  : undefined
              }
            >
              <Avatar name={chat.title} jid={chat.peerJid} avatarUrl={avatarOf(chat)} size={36} />
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className={LINE}>
                  {chat.kind === 'room' && (
                    <>
                      <Users size={14} className="shrink-0 text-ink-muted" aria-hidden />
                      <span className="sr-only">{text('chatList.room')} </span>
                    </>
                  )}
                  {record?.visibility === 'private' && (
                    <>
                      <Lock size={12} className="-ml-1 shrink-0 text-ink-muted" aria-hidden />
                      <span className="sr-only">{text('chatList.private')} </span>
                    </>
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold">{chat.title}</span>
                  {muted && (
                    <>
                      <BellOff size={12} className="shrink-0 text-ink-muted" aria-hidden />
                      <span className="sr-only">{text('chatList.muted')}</span>
                    </>
                  )}
                  {chat.lastMessage && (
                    <time
                      // The "⋯" takes the corner while the row is hovered or holds the focus.
                      className={cn(
                        'shrink-0 text-[12px] text-ink-muted',
                        room && 'group-focus-within/row:invisible group-hover/row:invisible',
                      )}
                      dateTime={chat.lastMessage.sentAt.toISOString()}
                    >
                      {formatRecent(locale, chat.lastMessage.sentAt)}
                    </time>
                  )}
                </span>
                <span className={LINE}>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
                    {chat.lastMessage?.encryption === 'undecryptable'
                      ? text('chatList.undecryptablePreview')
                      : (chat.lastMessage?.body ?? '')}
                  </span>
                  <Badge mentions={roomOf(chat)?.mentionsCount ?? 0} unread={chat.unreadCount} />
                </span>
              </span>
            </button>
            {room && onLeaveRoom && (
              <RoomRowMenu
                room={room}
                open={menuFor === chat.id}
                onOpen={() => setMenuFor(chat.id)}
                onClose={() => setMenuFor(null)}
                onLeave={onLeaveRoom}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Mentions ring on stamp yellow; plain unread letters stay muted so a hall does not shout. */
function Badge({ mentions, unread }: { mentions: number; unread: number }) {
  const text = useText();
  if (mentions > 0) {
    return (
      // The stamp: the mentions count on stamp yellow.
      <span className={cn(BADGE, 'bg-yellow text-on-yellow')}>
        {mentions}
        <span className="sr-only"> {text('chatList.mentions')}</span>
      </span>
    );
  }
  if (unread > 0) {
    return (
      // Unread letters without a mention: the count, without the stamp.
      <span className={cn(BADGE, 'bg-line text-ink')}>
        {unread}
        <span className="sr-only"> {text('chatList.unread')}</span>
      </span>
    );
  }
  return null;
}

/**
 * Up and Down move between the `button[data-row]` inside the element that hears the keys; shared
 * with `RequestList` and `InvitationList`. At the end of a list the key is left alone, so the
 * sidebar, which hears it next, moves on to the next group's rows.
 */
export function moveWithArrows(event: KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
  const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-row]')];
  const active = document.activeElement;
  const index = active instanceof HTMLButtonElement ? rows.indexOf(active) : -1;
  const next = index === -1 ? undefined : rows[event.key === 'ArrowDown' ? index + 1 : index - 1];
  if (!next) return;
  event.preventDefault();
  next.focus();
}
