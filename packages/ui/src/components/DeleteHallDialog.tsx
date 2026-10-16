import type { Room } from '@hey-postie/core';
import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { hallErrorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';
import { hallStyles } from './hallStyles';

interface DeleteHallDialogProps {
  room: Room;
  onClose: () => void;
  /** The service accepted; the hall leaves the list through `room.destroyed`. */
  onDeleted: () => void;
}

/**
 * The one confirmation before an owner deletes a hall: a plain sentence (it cannot be undone, and
 * the server keeps the address taken for a while), an optional reason sent to everyone in it,
 * Cancel and "Delete" in `danger`. Not closable while the service answers.
 */
export function DeleteHallDialog({ room, onClose, onDeleted }: DeleteHallDialogProps) {
  const core = useCore();
  const text = useText();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function destroy() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await core.rooms.destroy(room.jid, reason);
      onDeleted();
    } catch (caught) {
      setBusy(false);
      setError(hallErrorKey(caught));
    }
  }

  return (
    <Dialog title={text('room.deleteTitle')} onClose={onClose} closable={!busy}>
      <p className="m-0 wrap-anywhere">
        {text('room.deleteConfirm').replace('{name}', () => room.name)}
      </p>
      <Field
        label={text('room.deleteReason')}
        type="text"
        value={reason}
        maxLength={140}
        autoComplete="off"
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
      />
      {error && (
        <p className={`${hallStyles.postie} text-red`} role="alert">
          {text(error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>
          {text('dialog.cancel')}
        </Button>
        <Button variant="danger" onClick={() => void destroy()} disabled={busy} aria-busy={busy}>
          {text('room.deleteSubmit')}
        </Button>
      </div>
    </Dialog>
  );
}
