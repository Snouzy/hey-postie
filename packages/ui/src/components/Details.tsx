import type { Chat } from '@hey-postie/core';
import { X } from 'lucide-react';
import { useCore, useText } from '../core/CoreProvider';
import { Button } from './Button';
import styles from './Details.module.css';

interface DetailsProps {
  chat: Chat;
  onClose: () => void;
}

/** The right pane: who the peer is, and the one destructive action. Rooms will add more. */
export function Details({ chat, onClose }: DetailsProps) {
  const core = useCore();
  const text = useText();
  return (
    <aside className={styles.details} aria-label={text('main.details')}>
      <header className={styles.header}>
        <h2 className={styles.title}>{chat.title}</h2>
        <Button variant="ghost" onClick={onClose} aria-label={text('main.closeDetails')}>
          <X size={18} aria-hidden />
        </Button>
      </header>
      <dl className={styles.facts}>
        <dt>{text('details.jid')}</dt>
        <dd className={styles.jid}>{chat.peerJid}</dd>
      </dl>
      <Button variant="danger" onClick={() => void core.contacts.remove(chat.peerJid)}>
        {text('details.removeContact')}
      </Button>
    </aside>
  );
}
