import { type FormEvent, useId, useState } from 'react';
import { useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';
import styles from './NewChat.module.css';

interface NewChatProps {
  /** Main opens the chat; what went wrong, if anything, comes back here. */
  error: MessageKey | null;
  onOpen: (jid: string) => void;
  onClose: () => void;
}

/** "+" in the sidebar: a JID, handed to Main which opens the chat (and shows any error). */
export function NewChat({ error, onOpen, onClose }: NewChatProps) {
  const text = useText();
  const errorId = useId();
  const [jid, setJid] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    onOpen(jid);
  }

  return (
    <Dialog title={text('newChat.title')} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <Field
          label={text('newChat.jid')}
          type="text"
          placeholder={text('signIn.jidPlaceholder')}
          value={jid}
          onChange={(e) => setJid(e.target.value)}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {text(error)}
          </p>
        )}
        <div className={styles.actions}>
          <Button onClick={onClose}>{text('dialog.cancel')}</Button>
          <Button variant="primary" type="submit" disabled={!jid.trim()}>
            {text('newChat.open')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
