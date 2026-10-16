import type { Room, RoomAffiliation, RoomPerson } from '@hey-postie/core';
import { useEffect, useId, useRef, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { hallErrorKey } from '../i18n/errors';
import { Avatar } from './Avatar';
import { hallStyles } from './hallStyles';
import { type PersonAction, PersonMenu } from './PersonMenu';
import { PresenceDot } from './PresenceDot';
import { RemovePersonDialog } from './RemovePersonDialog';

interface HallPeopleProps {
  room: Room;
  /** In the service's order: present first, then away; owners and admins first. */
  people: RoomPerson[];
  /** My own address, to never offer an action on myself. */
  selfJid: string;
  /** After a change made here: the panel re-reads its people. */
  onChanged: () => void;
  /** Counts the header's people button presses: every new one sends the focus here. */
  focusRequest?: number;
}

/**
 * What I may do to someone, by my standing (the service and the server check again): an owner
 * makes admins and members; an admin or owner removes and bans, an owner only by an owner. Never
 * on myself, never on someone already banned. A standing needs a real address; removing someone
 * present needs only their seat.
 */
export function actionsOn(
  person: RoomPerson,
  mine: RoomAffiliation | undefined,
  isSelf: boolean,
): PersonAction[] {
  if (isSelf || person.affiliation === 'outcast') return [];
  const actions: PersonAction[] = [];
  if (mine === 'owner' && person.jid) {
    if (person.affiliation === 'member' || person.affiliation === 'none') actions.push('admin');
    if (person.affiliation === 'admin' || person.affiliation === 'none') actions.push('member');
  }
  const outranked = person.affiliation === 'owner' && mine !== 'owner';
  if ((mine === 'owner' || mine === 'admin') && !outranked) {
    actions.push('remove');
    if (person.jid) actions.push('ban');
  }
  return actions;
}

const bare = (jid: string) => (jid.split('/')[0] ?? jid).toLowerCase();

/**
 * The People part of the hall panel: an avatar, the name, a dot for those present now, the
 * standing as small muted text, and a "⋯" for those I may act on. Removing and banning are
 * confirmed; making admin or member is done at once. Names are the hall's text, shown as text.
 */
export function HallPeople({
  room,
  people,
  selfJid,
  onChanged,
  focusRequest = 0,
}: HallPeopleProps) {
  const core = useCore();
  const text = useText();
  const headingId = useId();
  const section = useRef<HTMLElement>(null);
  const [confirming, setConfirming] = useState<{
    person: RoomPerson;
    change: 'remove' | 'ban';
  } | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    if (focusRequest === 0) return;
    section.current?.focus();
    section.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusRequest]);

  const nameOf = (person: RoomPerson) => person.nick ?? person.jid ?? '';
  const isSelf = (person: RoomPerson) =>
    (person.present && person.nick === room.nick) ||
    (person.jid !== undefined && bare(person.jid) === bare(selfJid));

  async function pick(person: RoomPerson, action: PersonAction) {
    setError(null);
    if (action === 'remove' || action === 'ban') {
      setConfirming({ person, change: action });
      return;
    }
    try {
      await core.rooms.setRole(room.jid, person, action);
      onChanged();
    } catch (caught) {
      setError(hallErrorKey(caught));
    }
  }

  return (
    <section
      ref={section}
      className="flex flex-col gap-1 focus-visible:outline-offset-(--space-1)"
      aria-labelledby={headingId}
      tabIndex={-1}
    >
      <h3 id={headingId} className={hallStyles.heading}>
        {text('room.people')}
      </h3>
      {people.length === 0 && (
        <p className={`${hallStyles.postie} text-ink-muted`}>{text('room.membersEmpty')}</p>
      )}
      <ul className="m-0 flex list-none flex-col gap-[2px] p-0">
        {people.map((person) => {
          const name = nameOf(person);
          const self = isSelf(person);
          const actions = actionsOn(person, room.affiliation, self);
          return (
            <li
              key={person.jid ?? `${room.jid}/${person.nick}`}
              className="flex min-h-9 items-center gap-2 rounded-sm px-1"
            >
              <Avatar name={name} jid={person.jid ?? `${room.jid}/${person.nick}`} size={24} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1">
                  <span className="truncate" title={name}>
                    {name}
                  </span>
                  {self && <span className="shrink-0 text-ink-muted">{text('room.you')}</span>}
                  {person.present && <PresenceDot presence="online" />}
                </span>
                {person.affiliation !== 'none' && (
                  <span className="text-[12px] text-ink-muted">
                    {text(`room.affiliation.${person.affiliation}`)}
                  </span>
                )}
              </span>
              {actions.length > 0 && (
                <PersonMenu
                  name={name}
                  actions={actions}
                  onPick={(action) => void pick(person, action)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className={`${hallStyles.postie} text-red`} role="alert">
          {text(error)}
        </p>
      )}
      {confirming && (
        <RemovePersonDialog
          roomJid={room.jid}
          hallName={room.name}
          person={confirming.person}
          name={nameOf(confirming.person)}
          change={confirming.change}
          onClose={() => setConfirming(null)}
          onDone={() => {
            setConfirming(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
