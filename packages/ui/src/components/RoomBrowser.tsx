import { DomainError, type RoomInfo } from '@hey-postie/core';
import { Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Field } from './Field';
import styles from './RoomBrowser.module.css';

interface RoomBrowserProps {
  domain: string;
  onDomainChange: (domain: string) => void;
  onPick: (jid: string) => void;
}

/** The public halls of a server: a domain, "Browse", then a list to pick from. */
export function RoomBrowser({ domain, onDomainChange, onPick }: RoomBrowserProps) {
  const core = useCore();
  const text = useText();
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function browse(event: FormEvent) {
    event.preventDefault();
    setBrowsing(true);
    setError(null);
    try {
      setRooms(await core.rooms.browse(domain));
    } catch (caught) {
      setRooms(null);
      const badDomain = caught instanceof DomainError && caught.code === 'InvalidJid';
      setError(badDomain ? 'joinRoom.badDomain' : errorKey(caught));
    } finally {
      setBrowsing(false);
    }
  }

  return (
    <div className={styles.browser}>
      <form className={styles.form} onSubmit={browse}>
        <Field
          label={text('joinRoom.domain')}
          type="text"
          value={domain}
          onChange={(e) => onDomainChange(e.target.value)}
          required
        />
        <Button type="submit" disabled={browsing || !domain.trim()}>
          {text('joinRoom.browse')}
        </Button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
      {browsing && (
        <p className={styles.status} role="status">
          {text('joinRoom.browsing')}
        </p>
      )}
      {rooms && rooms.length === 0 && <p className={styles.status}>{text('joinRoom.noRooms')}</p>}
      {rooms && rooms.length > 0 && (
        <ul className={styles.list}>
          {rooms.map((room) => (
            <li key={room.jid}>
              <button type="button" className={styles.row} onClick={() => onPick(room.jid)}>
                <span className={styles.name}>{room.name}</span>
                <span className={styles.jid}>{room.jid}</span>
                {room.membersCount !== undefined && (
                  <span className={styles.count}>
                    <Users size={12} aria-hidden />
                    {text('joinRoom.membersCount').replace('{count}', String(room.membersCount))}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
