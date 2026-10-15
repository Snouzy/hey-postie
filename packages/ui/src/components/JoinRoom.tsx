import { type Account, DomainError, type Room } from '@hey-postie/core';
import { type FormEvent, useEffect, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';
import styles from './JoinRoom.module.css';
import { RoomBrowser } from './RoomBrowser';

interface JoinRoomProps {
  account: Account;
  onJoined: (room: Room) => void;
  onClose: () => void;
}

type Tab = 'address' | 'browse';

/**
 * "Join a room": an address and a nick, or the server's directory to pick one from. The password
 * field appears only once the hall asks for it.
 */
export function JoinRoom({ account, onJoined, onClose }: JoinRoomProps) {
  const core = useCore();
  const text = useText();
  const [localPart, domain] = account.jid.split('@');
  const [tab, setTab] = useState<Tab>('address');
  const [jid, setJid] = useState('');
  const [nick, setNick] = useState(localPart ?? '');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [joining, setJoining] = useState(false);
  const [browseDomain, setBrowseDomain] = useState(`rooms.${domain ?? ''}`);

  // The server says where its halls are; `rooms.<domain>` is the guess when it does not.
  useEffect(() => {
    let cancelled = false;
    core.rooms
      .roomService(domain ?? '')
      .then((service) => service && !cancelled && setBrowseDomain(service))
      .catch(() => {});
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

  function pick(roomJid: string) {
    setJid(roomJid);
    setTab('address');
  }

  return (
    <Dialog title={text('joinRoom.title')} onClose={onClose}>
      <div className={styles.tabs}>
        {(['address', 'browse'] as const).map((name) => (
          <button
            key={name}
            type="button"
            className={styles.tab}
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {text(`joinRoom.tabs.${name}`)}
          </button>
        ))}
      </div>
      {tab === 'browse' ? (
        <RoomBrowser domain={browseDomain} onDomainChange={setBrowseDomain} onPick={pick} />
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <Field
            label={text('joinRoom.jid')}
            type="text"
            placeholder={text('joinRoom.jidPlaceholder')}
            value={jid}
            onChange={(e) => setJid(e.target.value)}
            required
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
            <p className={styles.error} role="alert">
              {text(error)}
            </p>
          )}
          <div className={styles.actions}>
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
