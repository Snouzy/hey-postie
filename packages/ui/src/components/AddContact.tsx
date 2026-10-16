import { type FormEvent, useId, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import styles from './AddContact.module.css';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';

interface AddContactProps {
  onClose: () => void;
}

/** JID and an optional name; the service sends the subscription request. */
export function AddContact({ onClose }: AddContactProps) {
  const core = useCore();
  const text = useText();
  const errorId = useId();
  const [jid, setJid] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await core.contacts.add(name.trim() ? { jid, name } : { jid });
      onClose();
    } catch (caught) {
      setError(errorKey(caught));
    }
  }

  return (
    <Dialog title={text('addContact.title')} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <Field
          label={text('addContact.jid')}
          type="text"
          placeholder={text('signIn.jidPlaceholder')}
          value={jid}
          onChange={(e) => setJid(e.target.value)}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <Field
          label={text('addContact.name')}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {text(error)}
          </p>
        )}
        <div className={styles.actions}>
          <Button onClick={onClose}>{text('dialog.cancel')}</Button>
          <Button variant="primary" type="submit" disabled={!jid.trim()}>
            {text('addContact.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
