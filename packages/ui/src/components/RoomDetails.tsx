import type { Room, RoomMember, RoomNotify } from '@hey-postie/core';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useRoomMembers } from '../core/useRoomMembers';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import styles from './RoomDetails.module.css';

interface RoomDetailsProps {
  room: Room;
  onClose: () => void;
  /** After leaving: Main drops the selection. */
  onLeft: () => void;
}

const ROLES: readonly RoomMember['role'][] = ['moderator', 'participant', 'visitor'];
const RULES: readonly RoomNotify[] = ['all', 'mentions', 'none'];

/** The right pane of a hall: topic, who is there, when to ring the bell, and the way out. */
export function RoomDetails({ room, onClose, onLeft }: RoomDetailsProps) {
  const core = useCore();
  const text = useText();
  const members = useRoomMembers(room.jid);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function setNotify(rule: RoomNotify) {
    try {
      await core.rooms.setNotify(room.jid, rule);
    } catch (caught) {
      setError(errorKey(caught));
    }
  }

  async function leave() {
    try {
      await core.rooms.leave(room.jid);
      onLeft();
    } catch (caught) {
      setConfirming(false);
      setError(errorKey(caught));
    }
  }

  return (
    <aside className={styles.details} aria-label={text('main.members')}>
      <header className={styles.header}>
        <h2 className={styles.title}>{room.name}</h2>
        <Button variant="ghost" onClick={onClose} aria-label={text('main.closeDetails')}>
          <X size={18} aria-hidden />
        </Button>
      </header>
      <p className={styles.topic}>{room.topic || text('room.topicEmpty')}</p>
      <p className={styles.jid}>{room.jid}</p>

      <section className={styles.section} aria-label={text('room.members')}>
        {members.length === 0 && <p className={styles.empty}>{text('room.membersEmpty')}</p>}
        {ROLES.map((role) => {
          const group = members.filter((member) => member.role === role);
          if (group.length === 0) return null;
          return (
            <div key={role}>
              <h3 className={styles.heading}>{text(`room.role.${role}`)}</h3>
              <ul className={styles.list}>
                {group.map((member) => (
                  <li key={member.nick} className={styles.member}>
                    <span className={styles.nick}>{member.nick}</span>
                    {member.affiliation !== 'none' && (
                      <span className={styles.affiliation}>
                        {text(`room.affiliation.${member.affiliation}`)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <fieldset className={styles.notify}>
        <legend className={styles.heading}>{text('room.notify')}</legend>
        {RULES.map((rule) => (
          <label key={rule} className={styles.radio}>
            <input
              type="radio"
              name="notify"
              value={rule}
              checked={room.notify === rule}
              onChange={() => void setNotify(rule)}
            />
            {text(`room.notify.${rule}`)}
          </label>
        ))}
      </fieldset>

      <Button variant="danger" onClick={() => setConfirming(true)}>
        {text('room.leave')}
      </Button>
      {error && (
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
      {confirming && (
        <Dialog title={text('room.leave')} onClose={() => setConfirming(false)}>
          <p className={styles.confirm}>{text('room.confirmLeave')}</p>
          <div className={styles.actions}>
            <Button onClick={() => setConfirming(false)}>{text('dialog.cancel')}</Button>
            <Button variant="danger" onClick={() => void leave()}>
              {text('room.confirm')}
            </Button>
          </div>
        </Dialog>
      )}
    </aside>
  );
}
