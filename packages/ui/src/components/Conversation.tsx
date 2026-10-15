import type { Chat, Contact, Message, Room } from '@hey-postie/core';
import { Info, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useCoreEvent } from '../core/useCoreEvent';
import { useRoomMembers } from '../core/useRoomMembers';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Composer } from './Composer';
import styles from './Conversation.module.css';
import { MessageList } from './MessageList';
import { PresenceDot } from './PresenceDot';

interface ConversationProps {
  chat: Chat;
  /** The contact behind the chat, when it is in the address book: gives the presence. */
  contact: Contact | undefined;
  /** The hall behind the chat, when it is one: gives the topic and the members. */
  room: Room | undefined;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onOpenLink: (url: string) => void;
}

/** The center column: header, messages, composer. Owns the messages of the open chat. */
export function Conversation({
  chat,
  contact,
  room,
  detailsOpen,
  onToggleDetails,
  onOpenLink,
}: ConversationProps) {
  const core = useCore();
  const text = useText();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState<MessageKey | null>(null);
  const members = useRoomMembers(room?.jid ?? '');
  const nicks = room
    ? members.map((member) => member.nick).filter((nick) => nick !== room.nick)
    : [];

  useEffect(() => {
    let cancelled = false;
    core.chats
      .messages(chat.id)
      // Messages received while loading are already in the list: keep them.
      .then((loaded) => !cancelled && setMessages((current) => mergeById(loaded, current)))
      .catch((caught: unknown) => !cancelled && setError(errorKey(caught)));
    return () => {
      cancelled = true;
    };
  }, [core, chat.id]);

  useCoreEvent('message.received', (message) => {
    if (message.chatId !== chat.id) return;
    setMessages((current) => mergeById(current, [message]));
    // Only a reader who can see the window has read it.
    if (document.hasFocus()) void core.chats.markRead(chat.id).catch(() => {});
  });

  useCoreEvent('message.updated', (message) => {
    if (message.chatId !== chat.id) return;
    setMessages((current) => current.map((m) => (m.id === message.id ? message : m)));
  });

  useEffect(() => {
    const onFocus = () => void core.chats.markRead(chat.id).catch(() => {});
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [core, chat.id]);

  async function loadOlder(): Promise<boolean> {
    try {
      const older = await core.chats.loadOlder(chat.id);
      if (older.length === 0) setHasOlder(false);
      else setMessages((current) => mergeById(older, current));
      return older.length > 0;
    } catch (caught) {
      setError(errorKey(caught));
      return false;
    }
  }

  async function send(body: string) {
    const sent = await core.chats.send(chat.id, body);
    setMessages((current) => mergeById(current, [sent]));
  }

  function retry(failed: Message) {
    setMessages((current) => current.filter((m) => m.id !== failed.id));
    send(failed.body).catch(() => setMessages((current) => mergeById(current, [failed])));
  }

  return (
    <section className={styles.conversation} aria-label={chat.title}>
      <header className={styles.header}>
        <div className={styles.peer}>
          {contact && <PresenceDot presence={contact.presence} />}
          <h2 className={styles.title}>{chat.title}</h2>
          {room && (
            <p className={styles.topic} title={room.topic}>
              {room.topic || text('room.topicEmpty')}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={onToggleDetails}
          aria-pressed={detailsOpen}
          aria-label={text(room ? 'main.members' : 'main.details')}
        >
          {room ? <Users size={18} aria-hidden /> : <Info size={18} aria-hidden />}
        </Button>
      </header>
      <MessageList
        messages={messages}
        hasOlder={hasOlder}
        onLoadOlder={loadOlder}
        onRetry={retry}
        onOpenLink={onOpenLink}
        showSenders={Boolean(room)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
      <Composer onSend={send} nicks={nicks} />
    </section>
  );
}

/** `first` then whatever in `second` is not already there, by id. Order within each is kept. */
export function mergeById(first: Message[], second: Message[]): Message[] {
  const seen = new Set(first.map((m) => m.id));
  return [...first, ...second.filter((m) => !seen.has(m.id))];
}
