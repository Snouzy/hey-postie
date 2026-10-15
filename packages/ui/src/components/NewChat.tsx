import type { Chat } from '@hey-postie/core';
import { type FormEvent, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';
import styles from './NewChat.module.css';

interface NewChatProps {
  onOpened: (chat: Chat) => void;
  onClose: () => void;
}

/** "+" in the sidebar: a JID, and the chat opens. */
export function NewChat({ onOpened, onClose }: NewChatProps) {
  const core = useCore();
  const text = useText();
  const [jid, setJid] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onOpened(await core.chats.open(jid));
    } catch (caught) {
      setError(errorKey(caught));
    }
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
        />
        {error && (
          <p className={styles.error} role="alert">
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
