import type { Chat, Contact, Room } from '@hey-postie/core';
import { Users } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import { formatRecent } from '../i18n/dates';
import { Postie } from '../illustrations/Postie';
import { Avatar } from './Avatar';
import styles from './ChatList.module.css';
import { EmptyState } from './EmptyState';
import { RoomRowMenu } from './RoomRowMenu';

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
    <ul className={styles.list} onKeyDown={moveWithArrows}>
      {chats.map((chat) => {
        const room = onLeaveRoom && chat.kind === 'room' ? roomOf(chat) : undefined;
        return (
          <li key={chat.id} className={styles.item} data-menu={room ? '' : undefined}>
            <button
              type="button"
              data-row=""
              className={styles.row}
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
              <span className={styles.lines}>
                <span className={styles.top}>
                  {chat.kind === 'room' && (
                    <>
                      <Users size={14} className={styles.hall} aria-hidden />
                      <span className={styles.srOnly}>{text('chatList.room')} </span>
                    </>
                  )}
                  <span className={styles.title}>{chat.title}</span>
                  {chat.lastMessage && (
                    <time className={styles.time} dateTime={chat.lastMessage.sentAt.toISOString()}>
                      {formatRecent(locale, chat.lastMessage.sentAt)}
                    </time>
                  )}
                </span>
                <span className={styles.bottom}>
                  <span className={styles.preview}>
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
      <span className={styles.badge}>
        {mentions}
        <span className={styles.srOnly}> {text('chatList.mentions')}</span>
      </span>
    );
  }
  if (unread > 0) {
    return (
      <span className={`${styles.badge} ${styles.muted}`}>
        {unread}
        <span className={styles.srOnly}> {text('chatList.unread')}</span>
      </span>
    );
  }
  return null;
}

function moveWithArrows(event: KeyboardEvent<HTMLUListElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-row]')];
  const active = document.activeElement;
  const index = active instanceof HTMLButtonElement ? rows.indexOf(active) : -1;
  if (index === -1) return;
  event.preventDefault();
  const next = rows[event.key === 'ArrowDown' ? index + 1 : index - 1];
  next?.focus();
}
