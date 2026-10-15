import type { Chat, Room } from '@hey-postie/core';
import { Users } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import { formatRecent } from '../i18n/dates';
import styles from './ChatList.module.css';

interface ChatListProps {
  chats: Chat[];
  /** The halls, for their mentions count. */
  rooms?: Room[];
  selectedId: string | null;
  onSelect: (chat: Chat) => void;
}

/** The sidebar list. Arrow keys move between rows; Enter or a click opens one. */
export function ChatList({ chats, rooms = [], selectedId, onSelect }: ChatListProps) {
  const text = useText();
  const locale = useLocale();
  const mentionsOf = (chat: Chat) => rooms.find((room) => room.jid === chat.id)?.mentionsCount ?? 0;

  if (chats.length === 0) return <p className={styles.empty}>{text('chatList.empty')}</p>;

  return (
    <ul className={styles.list} onKeyDown={moveWithArrows}>
      {chats.map((chat) => (
        <li key={chat.id}>
          <button
            type="button"
            className={styles.row}
            aria-current={chat.id === selectedId ? 'true' : undefined}
            onClick={() => onSelect(chat)}
          >
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
              <Badge mentions={mentionsOf(chat)} unread={chat.unreadCount} />
            </span>
          </button>
        </li>
      ))}
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
  const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
  const active = document.activeElement;
  const index = active instanceof HTMLButtonElement ? rows.indexOf(active) : -1;
  if (index === -1) return;
  event.preventDefault();
  const next = rows[event.key === 'ArrowDown' ? index + 1 : index - 1];
  next?.focus();
}
