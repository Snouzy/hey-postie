import { type Account, DomainError, type Room, type RoomVisibility } from '@hey-postie/core';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';
import { VisibilityChoice } from './VisibilityChoice';

interface CreateRoomProps {
  account: Account;
  /** The hall exists, its creator is its owner: the caller opens it and the invite dialog. */
  onCreated: (room: Room) => void;
  onClose: () => void;
  /** A name to start from (the one searched for in Browse halls). */
  initialName?: string;
}

const NOTE = "m-0 font-heading [font-variation-settings:'SOFT'_100]";

/**
 * "Create a hall": a name, the address derived from it (until the user edits the address), an
 * optional description, and Private (default) or Public. The rules (lengths, what an address
 * accepts, a taken address) are the service's; this only shows its sentence.
 */
export function CreateRoom({ account, onCreated, onClose, initialName = '' }: CreateRoomProps) {
  const core = useCore();
  const text = useText();
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(() =>
    initialName.trim() ? core.rooms.suggestAddress(initialName) : '',
  );
  const [addressEdited, setAddressEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<RoomVisibility>('private');
  const [service, setService] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<{ key: MessageKey; field: 'name' | 'address' | null } | null>(
    null,
  );

  // Where the hall will live: shown after the address, so the user sees the whole of it.
  useEffect(() => {
    let cancelled = false;
    core.rooms
      .roomService(account.jid.split('@')[1] ?? '')
      .then((found) => !cancelled && setService(found))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [core, account.jid]);

  function changeName(value: string) {
    setName(value);
    setError(null);
    if (!addressEdited) setAddress(value.trim() ? core.rooms.suggestAddress(value) : '');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const room = await core.rooms.create({
        name,
        visibility,
        ...(address.trim() ? { address } : {}),
        ...(description.trim() ? { description } : {}),
      });
      onCreated(room);
    } catch (caught) {
      setCreating(false);
      setError({ key: errorKey(caught), field: fieldOf(caught) });
    }
  }

  const invalid = (field: 'name' | 'address') =>
    error?.field === field ? { 'aria-invalid': true, 'aria-describedby': errorId } : {};

  return (
    <Dialog title={text('createRoom.title')} onClose={onClose} closable={!creating} size="medium">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <p className="m-0 text-[14px] text-ink-muted">{text('createRoom.intro')}</p>
        <Field
          label={text('createRoom.name')}
          type="text"
          placeholder={text('createRoom.namePlaceholder')}
          value={name}
          maxLength={64}
          autoComplete="off"
          onChange={(e) => changeName(e.target.value)}
          disabled={creating}
          required
          {...invalid('name')}
        />
        <Field
          className="[&_input]:font-mono"
          label={text('createRoom.address')}
          type="text"
          value={address}
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setAddress(e.target.value);
            setAddressEdited(true);
            setError(null);
          }}
          disabled={creating}
          suffix={service ? <span className="font-mono text-[13px]">@{service}</span> : undefined}
          {...invalid('address')}
        />
        <Field
          label={text('createRoom.description')}
          type="text"
          value={description}
          autoComplete="off"
          onChange={(e) => setDescription(e.target.value)}
          disabled={creating}
        />
        <VisibilityChoice value={visibility} onChange={setVisibility} disabled={creating} />
        {error && (
          <p id={errorId} className={`${NOTE} text-red`} role="alert">
            {text(error.key)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={creating}>
            {text('dialog.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={creating || !name.trim()}
            aria-busy={creating}
          >
            {text(creating ? 'createRoom.creating' : 'createRoom.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Which field the refusal is about, so it can say so to a screen reader. */
function fieldOf(error: unknown): 'name' | 'address' | null {
  if (!(error instanceof DomainError)) return null;
  if (error.code === 'InvalidRoomName') return 'name';
  if (error.code === 'RoomExists' || error.code === 'InvalidJid') return 'address';
  return null;
}
