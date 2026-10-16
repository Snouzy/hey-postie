import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import styles from './BlockContactDialog.module.css';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface BlockContactDialogProps {
  jid: string;
  name: string;
  /** Cancel, Esc or the X: nothing happened. */
  onClose: () => void;
  /** The service accepted: the caller drops what it showed of the stranger. */
  onBlocked: () => void;
}

/**
 * The one confirmation before blocking someone: it names them, says the server will drop
 * everything they send, then calls `contacts.block`. A failure keeps the card open with Postie's
 * sentence; while the call is in flight the card cannot be closed.
 */
export function BlockContactDialog({ jid, name, onClose, onBlocked }: BlockContactDialogProps) {
  const core = useCore();
  const text = useText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function block() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await core.contacts.block(jid);
      onBlocked();
    } catch (caught) {
      setBusy(false);
      setError(errorKey(caught));
    }
  }

  return (
    <Dialog title={text('requests.blockTitle')} onClose={onClose} closable={!busy}>
      <p className={styles.sentence}>{text('requests.confirmBlock').replace('{name}', name)}</p>
      <p className={styles.address}>{jid}</p>
      {error && (
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={onClose} disabled={busy}>
          {text('dialog.cancel')}
        </Button>
        <Button variant="danger" onClick={() => void block()} disabled={busy} aria-busy={busy}>
          {text('requests.confirm')}
        </Button>
      </div>
    </Dialog>
  );
}
