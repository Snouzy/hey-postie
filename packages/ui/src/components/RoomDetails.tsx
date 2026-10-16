import type { Room, RoomMember, RoomNotify } from '@hey-postie/core';
import { UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useRoomMembers } from '../core/useRoomMembers';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { LeaveRoomDialog } from './LeaveRoomDialog';
import { RoomEncryption } from './RoomEncryption';

interface RoomDetailsProps {
  room: Room;
  onClose: () => void;
  /** After a change the core may not announce (the notify rule): Main re-reads the halls. */
  onChanged: () => Promise<void>;
  /** After leaving: Main drops the selection. */
  onLeft: () => void;
  /** Counts the "Check their devices" requests; each new one focuses the Encryption section. */
  focusRequest?: number;
  /** Opens the invite dialog on this hall (a first entry, until the hall panel is rebuilt). */
  onInvite?: (() => void) | undefined;
}

const ROLES: readonly RoomMember['role'][] = ['moderator', 'participant', 'visitor'];
const RULES: readonly RoomNotify[] = ['all', 'mentions', 'none'];

/** The right pane of a hall: topic, who is there, when to ring the bell, and the way out. */
export function RoomDetails({
  room,
  onClose,
  onChanged,
  onLeft,
  focusRequest = 0,
  onInvite,
}: RoomDetailsProps) {
  const core = useCore();
  const text = useText();
  const members = useRoomMembers(room.jid);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function setNotify(rule: RoomNotify) {
    try {
      await core.rooms.setNotify(room.jid, rule);
      await onChanged();
    } catch (caught) {
      setError(errorKey(caught));
    }
  }

  return (
    <aside
      className="flex w-[clamp(240px,var(--details-width,280px),480px)] shrink-0 flex-col gap-4 border-l border-line bg-paper p-4 overflow-y-auto"
      aria-label={text('main.members')}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="truncate text-[20px]">{room.name}</h2>
        <Button variant="ghost" onClick={onClose} aria-label={text('main.closeDetails')}>
          <X size={18} aria-hidden />
        </Button>
      </header>
      <p className="m-0 wrap-anywhere">{room.topic || text('room.topicEmpty')}</p>
      <p className="m-0 font-mono text-[13px] text-ink-muted wrap-anywhere">{room.jid}</p>
      {onInvite && room.joined && (
        <Button onClick={onInvite}>
          <UserPlus size={16} aria-hidden />
          {text('room.invite')}
        </Button>
      )}

      <section className="flex flex-col gap-3" aria-label={text('room.members')}>
        {/* Postie keeps the door open: his voice, so the heading font. */}
        {members.length === 0 && (
          <p className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-ink-muted">
            {text('room.membersEmpty')}
          </p>
        )}
        {ROLES.map((role) => {
          const group = members.filter((member) => member.role === role);
          if (group.length === 0) return null;
          return (
            <div key={role}>
              <h3 className="mx-0 mt-0 mb-1 p-0 font-text text-[12px] font-bold tracking-[0.04em] uppercase text-ink-muted">
                {text(`room.role.${role}`)}
              </h3>
              <ul className="m-0 flex list-none flex-col gap-[2px] p-0">
                {group.map((member) => (
                  <li key={member.nick} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{member.nick}</span>
                    {member.affiliation !== 'none' && (
                      <span className="shrink-0 text-[12px] text-kraft-ink">
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

      <RoomEncryption members={members} focusRequest={focusRequest} />

      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mx-0 mt-0 mb-1 p-0 font-text text-[12px] font-bold tracking-[0.04em] uppercase text-ink-muted">
          {text('room.notify')}
        </legend>
        {RULES.map((rule) => (
          <label
            key={rule}
            className="flex cursor-pointer items-center gap-2 [&_input]:accent-navy"
          >
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
        <p className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-red" role="alert">
          {text(error)}
        </p>
      )}
      {confirming && (
        <LeaveRoomDialog room={room} onClose={() => setConfirming(false)} onLeft={onLeft} />
      )}
    </aside>
  );
}
