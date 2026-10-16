import type { RoomPerson } from '@hey-postie/core';
import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { hallErrorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { hallStyles } from './hallStyles';

interface RemovePersonDialogProps {
  roomJid: string;
  hallName: string;
  person: RoomPerson;
  /** The name the panel shows for them. */
  name: string;
  change: 'remove' | 'ban';
  onClose: () => void;
  /** The service accepted: the panel re-reads its people. */
  onDone: () => void;
}

/**
 * The one confirmation before someone goes out of a hall: removed (they leave and are no longer
 * a member) or banned (they cannot come back). A refusal keeps the card with Postie's sentence;
 * not closable while the service answers.
 */
export function RemovePersonDialog({
  roomJid,
  hallName,
  person,
  name,
  change,
  onClose,
  onDone,
}: RemovePersonDialogProps) {
  const core = useCore();
  const text = useText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await core.rooms.setRole(roomJid, person, change);
      onDone();
    } catch (caught) {
      setBusy(false);
      setError(hallErrorKey(caught));
    }
  }

  return (
    <Dialog title={text(`room.${change}Title`)} onClose={onClose} closable={!busy}>
      <p className="m-0 wrap-anywhere">
        {text(`room.${change}Confirm`)
          .replace('{name}', () => name)
          .replace('{hall}', () => hallName)}
      </p>
      {error && (
        <p className={`${hallStyles.postie} text-red`} role="alert">
          {text(error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>
          {text('dialog.cancel')}
        </Button>
        <Button variant="danger" onClick={() => void confirm()} disabled={busy} aria-busy={busy}>
          {text(`room.${change}Submit`)}
        </Button>
      </div>
    </Dialog>
  );
}
