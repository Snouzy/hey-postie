import { type Account, DomainError, type Room, type RoomVisibility } from '@hey-postie/core';
import { Globe, Lock } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';

interface CreateRoomProps {
  account: Account;
  /** The hall exists, its creator is its owner: the caller opens it and the invite dialog. */
  onCreated: (room: Room) => void;
  onClose: () => void;
}

const VISIBILITIES: readonly { value: RoomVisibility; icon: typeof Lock }[] = [
  { value: 'private', icon: Lock },
  { value: 'public', icon: Globe },
];

/** A choice card: the radio, an icon, a title and its hint; the chosen one wears a navy border. */
const CHOICE =
  'flex flex-1 cursor-pointer items-start gap-2 rounded-sm border border-line-strong bg-paper-raised p-3 has-checked:border-navy has-checked:bg-fill-hover [&_input]:accent-navy';
const NOTE = "m-0 font-heading [font-variation-settings:'SOFT'_100]";

/**
 * "Create a hall": a name, the address derived from it (until the user edits the address), an
 * optional description, and Private (default) or Public. The rules (lengths, what an address
 * accepts, a taken address) are the service's; this only shows its sentence.
 */
export function CreateRoom({ account, onCreated, onClose }: CreateRoomProps) {
  const core = useCore();
  const text = useText();
  const errorId = useId();
  const hintId = useId();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
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
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={creating}>
          <legend className="mb-1 p-0 text-[13px] font-semibold text-ink-muted">
            {text('createRoom.visibility')}
          </legend>
          <div className="flex gap-2">
            {VISIBILITIES.map(({ value, icon: Icon }) => (
              <label key={value} className={CHOICE}>
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  className="mt-1"
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                  aria-describedby={`${hintId}-${value}`}
                />
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 font-semibold">
                    <Icon size={14} aria-hidden />
                    {text(`createRoom.${value}`)}
                  </span>
                  <span id={`${hintId}-${value}`} className="text-[13px] text-ink-muted">
                    {text(`createRoom.${value}Hint`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
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
