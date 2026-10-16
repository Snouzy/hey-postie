import type { Chat } from '@hey-postie/core';
import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useMessages } from '../core/useMessages';
import type { RequestRow } from '../core/useRequests';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import type { SaveFile } from './Attachments';
import { BlockContactDialog } from './BlockContactDialog';
import { Button } from './Button';
import { MessageList } from './MessageList';
import styles from './MessageRequest.module.css';

interface MessageRequestProps {
  row: RequestRow;
  /** The service added them to the address book: the caller opens the chat as a normal one. */
  onAccepted: (jid: string) => void;
  /** Declined (when a request was pending) and put away for the session. */
  onIgnored: (jid: string) => void;
  /** The server now drops everything they send. */
  onBlocked: (jid: string) => void;
  onOpenLink: (url: string) => void;
  onSaveFile: SaveFile;
}

/**
 * The request screen, in place of the conversation: who is asking, their note (text only), what
 * accepting means, and Accept / Ignore / Block (the last one confirmed). The letters they already
 * sent sit below, read-only: no composer until they are accepted.
 */
export function MessageRequest({
  row,
  onAccepted,
  onIgnored,
  onBlocked,
  onOpenLink,
  onSaveFile,
}: MessageRequestProps) {
  const core = useCore();
  const text = useText();
  const [busy, setBusy] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function run(action: () => Promise<unknown>, then: () => void) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      then();
    } catch (caught) {
      setBusy(false);
      setError(errorKey(caught));
    }
  }

  const accept = () =>
    run(
      () => core.contacts.accept(row.jid),
      () => onAccepted(row.jid),
    );
  const ignore = () =>
    run(
      () => (row.requested ? core.contacts.ignore(row.jid) : Promise.resolve()),
      () => onIgnored(row.jid),
    );

  return (
    <section className={styles.request} aria-label={row.name}>
      <header className={styles.header}>
        <h2 className={styles.title}>{row.name}</h2>
        <p className={styles.address}>{row.jid}</p>
        <p className={styles.explain}>{text('requests.explain')}</p>
        {row.message && (
          <blockquote className={styles.note}>
            <span className={styles.noteLabel}>{text('requests.theirNote')}</span>
            <span className={styles.noteText}>{row.message}</span>
          </blockquote>
        )}
        <p className={styles.hint}>{text('requests.accepting')}</p>
        {error && (
          <p className={styles.error} role="alert">
            {text(error)}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => void accept()} disabled={busy} aria-busy={busy}>
            {text('requests.accept')}
          </Button>
          <Button onClick={() => void ignore()} disabled={busy}>
            {text('requests.ignore')}
          </Button>
          <Button variant="danger" onClick={() => setBlocking(true)} disabled={busy}>
            {text('requests.block')}
          </Button>
        </div>
      </header>
      {row.chat && (
        <>
          <h3 className={styles.held}>{text('requests.lettersHeld')}</h3>
          <HeldLetters
            key={row.chat.id}
            chat={row.chat}
            onOpenLink={onOpenLink}
            onSaveFile={onSaveFile}
          />
        </>
      )}
      {blocking && (
        <BlockContactDialog
          jid={row.jid}
          name={row.name}
          onClose={() => setBlocking(false)}
          onBlocked={() => {
            setBlocking(false);
            onBlocked(row.jid);
          }}
        />
      )}
    </section>
  );
}

/** The stranger's letters, through the same list as a conversation (attachments wait for a click). */
function HeldLetters({
  chat,
  onOpenLink,
  onSaveFile,
}: {
  chat: Chat;
  onOpenLink: (url: string) => void;
  onSaveFile: SaveFile;
}) {
  const text = useText();
  const letters = useMessages(chat);
  return (
    <>
      <MessageList
        messages={letters.messages}
        hasOlder={letters.hasOlder}
        onLoadOlder={letters.loadOlder}
        onRetry={letters.retry}
        onOpenLink={onOpenLink}
        onReact={letters.react}
        onSaveFile={onSaveFile}
      />
      {letters.error && (
        <p className={styles.error} role="alert">
          {text(letters.error)}
        </p>
      )}
    </>
  );
}
