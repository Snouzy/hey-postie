import type { Room, RoomSettings, RoomVisibility } from '@hey-postie/core';
import { type FormEvent, useId, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { hallErrorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';
import { hallStyles } from './hallStyles';
import { VisibilityChoice } from './VisibilityChoice';

interface EditHallDialogProps {
  room: Room;
  /** What the server said of the hall; the room record stands in while it has not. */
  settings: RoomSettings | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * "Edit the hall", for its owners: name, description, Private or Public. Only what changed is
 * sent (`rooms.configure`); the rules (an empty name, rights) are the service's, and a refusal
 * is Postie's sentence. Not closable while the server answers.
 */
export function EditHallDialog({ room, settings, onClose, onSaved }: EditHallDialogProps) {
  const core = useCore();
  const text = useText();
  const errorId = useId();
  const before: RoomSettings = settings ?? {
    name: room.name,
    description: '',
    visibility: room.visibility ?? 'private',
  };
  const [name, setName] = useState(before.name);
  const [description, setDescription] = useState(before.description);
  const [visibility, setVisibility] = useState<RoomVisibility>(before.visibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const change: Partial<RoomSettings> = {
      ...(name !== before.name ? { name } : {}),
      ...(description !== before.description ? { description } : {}),
      ...(visibility !== before.visibility ? { visibility } : {}),
    };
    if (Object.keys(change).length === 0) return onClose();
    setSaving(true);
    setError(null);
    try {
      await core.rooms.configure(room.jid, change);
      onSaved();
    } catch (caught) {
      setSaving(false);
      setError(hallErrorKey(caught));
    }
  }

  const invalid = error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {};

  return (
    <Dialog title={text('room.edit')} onClose={onClose} closable={!saving} size="medium">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field
          label={text('createRoom.name')}
          type="text"
          value={name}
          maxLength={64}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          disabled={saving}
          required
          {...(error === 'error.InvalidRoomName' ? invalid : {})}
        />
        <Field
          label={text('createRoom.description')}
          type="text"
          value={description}
          autoComplete="off"
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving}
        />
        <VisibilityChoice value={visibility} onChange={setVisibility} disabled={saving} />
        {error && (
          <p id={errorId} className={`${hallStyles.postie} text-red`} role="alert">
            {text(error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={saving}>
            {text('dialog.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={saving || !name.trim()}
            aria-busy={saving}
          >
            {text(saving ? 'room.saving' : 'room.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
