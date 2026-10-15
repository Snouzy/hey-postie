import type { Chat, Contact, Message } from '@hey-postie/core';
import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useCoreEvent } from '../core/useCoreEvent';
import { Button } from './Button';
import { Composer } from './Composer';
import styles from './Conversation.module.css';
import { MessageList } from './MessageList';
import { PresenceDot } from './PresenceDot';

interface ConversationProps {
  chat: Chat;
  /** The contact behind the chat, when it is in the address book: gives the presence. */
  contact: Contact | undefined;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onOpenLink: (url: string) => void;
}

/** The center column: header, messages, composer. Owns the messages of the open chat. */
export function Conversation({
  chat,
  contact,
  detailsOpen,
  onToggleDetails,
  onOpenLink,
}: ConversationProps) {
  const core = useCore();
  const text = useText();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setHasOlder(true);
    void core.chats.messages(chat.id).then((loaded) => {
      if (!cancelled) setMessages(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [core, chat.id]);

  useCoreEvent('message.received', (message) => {
    if (message.chatId !== chat.id) return;
    setMessages((current) => [...current, message]);
    // The reader is looking at this chat: what arrives is read.
    void core.chats.markRead(chat.id);
  });

  useCoreEvent('message.updated', (message) => {
    if (message.chatId !== chat.id) return;
    setMessages((current) => current.map((m) => (m.id === message.id ? message : m)));
  });

  async function loadOlder() {
    const older = await core.chats.loadOlder(chat.id);
    if (older.length === 0) setHasOlder(false);
    else setMessages((current) => [...older, ...current]);
  }

  async function send(body: string) {
    const sent = await core.chats.send(chat.id, body);
    setMessages((current) => [...current, sent]);
  }

  function retry(failed: Message) {
    setMessages((current) => current.filter((m) => m.id !== failed.id));
    void send(failed.body).catch(() => {
      setMessages((current) => [...current, failed]);
    });
  }

  return (
    <section className={styles.conversation} aria-label={chat.title}>
      <header className={styles.header}>
        <div className={styles.peer}>
          {contact && <PresenceDot presence={contact.presence} />}
          <h2 className={styles.title}>{chat.title}</h2>
        </div>
        <Button
          variant="ghost"
          onClick={onToggleDetails}
          aria-pressed={detailsOpen}
          aria-label={text('main.details')}
        >
          <Info size={18} aria-hidden />
        </Button>
      </header>
      <MessageList
        key={chat.id}
        messages={messages}
        hasOlder={hasOlder}
        onLoadOlder={loadOlder}
        onRetry={retry}
        onOpenLink={onOpenLink}
      />
      <Composer onSend={send} />
    </section>
  );
}
