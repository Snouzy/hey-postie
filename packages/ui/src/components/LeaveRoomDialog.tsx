import type { Room } from '@hey-postie/core';
import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import styles from './LeaveRoomDialog.module.css';

interface LeaveRoomDialogProps {
  room: Room;
  /** Cancel, Esc or the X: nothing happened. */
  onClose: () => void;
  /** The service accepted: the caller drops what it showed of the hall. */
  onLeft: () => void;
}

/**
 * The one confirmation before leaving a hall, reached from the room row and from the details pane.
 * It names the hall, says the bookmark goes and the letters stay on the server, then calls
 * `rooms.leave`. A failure keeps the card open with Postie's sentence; while the call is in flight
 * the card cannot be closed.
 */
export function LeaveRoomDialog({ room, onClose, onLeft }: LeaveRoomDialogProps) {
  const core = useCore();
  const text = useText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function leave() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await core.rooms.leave(room.jid);
      onLeft();
    } catch (caught) {
      setBusy(false);
      setError(errorKey(caught));
    }
  }

  return (
    <Dialog title={text('room.leave')} onClose={onClose} closable={!busy}>
      <p className={styles.sentence}>{text('room.confirmLeave').replace('{name}', room.name)}</p>
      {error && (
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={onClose} disabled={busy}>
          {text('dialog.cancel')}
        </Button>
        <Button variant="danger" onClick={() => void leave()} disabled={busy} aria-busy={busy}>
          {text('room.confirm')}
        </Button>
      </div>
    </Dialog>
  );
}
