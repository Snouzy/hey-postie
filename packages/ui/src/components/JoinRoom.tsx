import { type Account, DomainError, type Room } from '@hey-postie/core';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';
import { RoomBrowser } from './RoomBrowser';

interface JoinRoomProps {
  account: Account;
  /** The halls the app knows: those joined are marked in the directory. */
  rooms: Room[];
  /** `browse` from the Halls heading's "Browse halls". Default: the address form. */
  initialTab?: Tab;
  onJoined: (room: Room) => void;
  /** "Create the hall …" from the directory: the caller opens the create dialog with that name. */
  onCreate: (name: string) => void;
  onClose: () => void;
}

type Tab = 'address' | 'browse';

/**
 * "Join a hall": an address and a nick, or the server's directory (Browse halls) to join one from
 * at once. The password field appears only once the hall asks for it.
 */
export function JoinRoom({
  account,
  rooms,
  initialTab = 'address',
  onJoined,
  onCreate,
  onClose,
}: JoinRoomProps) {
  const core = useCore();
  const text = useText();
  const errorId = useId();
  const [localPart, domain] = account.jid.split('@');
  const [tab, setTab] = useState<Tab>(initialTab);
  const [jid, setJid] = useState('');
  const [nick, setNick] = useState(localPart ?? '');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [joining, setJoining] = useState(false);
  const [browseDomain, setBrowseDomain] = useState(`rooms.${domain ?? ''}`);
  const [discovered, setDiscovered] = useState(false);
  const joined = new Set(rooms.filter((room) => room.joined).map((room) => room.jid));

  // The server says where its halls are; `rooms.<domain>` is the guess when it does not.
  useEffect(() => {
    let cancelled = false;
    core.rooms
      .roomService(domain ?? '')
      .then((service) => service && !cancelled && setBrowseDomain(service))
      .catch(() => {})
      .finally(() => !cancelled && setDiscovered(true));
    return () => {
      cancelled = true;
    };
  }, [core, domain]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setJoining(true);
    setError(null);
    try {
      const room = await core.rooms.join(password ? { jid, nick, password } : { jid, nick });
      onJoined(room);
    } catch (caught) {
      if (caught instanceof DomainError && caught.code === 'RoomPasswordRequired') {
        setNeedsPassword(true);
      }
      setError(errorKey(caught));
    } finally {
      setJoining(false);
    }
  }

  return (
    <Dialog title={text('joinRoom.title')} onClose={onClose} size="medium">
      <div className="flex border-b border-line">
        {(['address', 'browse'] as const).map((name) => (
          <button
            key={name}
            type="button"
            className="flex-1 cursor-pointer border-0 border-b-2 border-transparent bg-transparent p-2 font-semibold text-ink-muted transition-[color,border-color] duration-(--motion-fast) aria-pressed:border-b-navy aria-pressed:text-navy"
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {text(`joinRoom.tabs.${name}`)}
          </button>
        ))}
      </div>
      {tab === 'browse' ? (
        <RoomBrowser
          domain={browseDomain}
          onDomainChange={setBrowseDomain}
          ready={discovered}
          nick={nick}
          joined={joined}
          onJoined={onJoined}
          onCreate={onCreate}
        />
      ) : (
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <Field
            label={text('joinRoom.jid')}
            type="text"
            placeholder={text('joinRoom.jidPlaceholder')}
            value={jid}
            onChange={(e) => setJid(e.target.value)}
            required
            aria-invalid={error && !needsPassword ? true : undefined}
            aria-describedby={error && !needsPassword ? errorId : undefined}
          />
          <Field
            label={text('joinRoom.nick')}
            type="text"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            required
          />
          {needsPassword && (
            <Field
              label={text('joinRoom.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          {error && (
            <p
              id={errorId}
              className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-red"
              role="alert"
            >
              {text(error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>{text('dialog.cancel')}</Button>
            <Button
              variant="primary"
              type="submit"
              disabled={joining || !jid.trim() || !nick.trim()}
            >
              {text('joinRoom.submit')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
