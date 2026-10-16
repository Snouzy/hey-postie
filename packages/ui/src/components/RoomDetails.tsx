import type { Room, RoomNotify } from '@hey-postie/core';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useAccount } from '../core/useAccount';
import { useRoomMembers } from '../core/useRoomMembers';
import { useRoomPeople } from '../core/useRoomPeople';
import { useRoomSettings } from '../core/useRoomSettings';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { HallActions } from './HallActions';
import { HallFacts } from './HallFacts';
import { HallHero } from './HallHero';
import { HallPeople } from './HallPeople';
import { hallStyles } from './hallStyles';
import { RoomEncryption } from './RoomEncryption';

interface RoomDetailsProps {
  room: Room;
  onClose: () => void;
  /** After a change the core may not announce (the notify rule, the name): Main re-reads the halls. */
  onChanged: () => Promise<void>;
  /** After leaving or deleting: Main drops the selection. */
  onLeft: () => void;
  /** Counts the "Check their devices" requests; each new one focuses the Encryption section. */
  focusRequest?: number;
  /** Counts the header's people button presses; each new one focuses the People section. */
  peopleFocus?: number;
  /** Opens the invite dialog on this hall. */
  onInvite?: (() => void) | undefined;
}

const RULES: readonly RoomNotify[] = ['all', 'mentions', 'none'];

/**
 * The hall panel, on the right: the hall itself (name, description, the owner's pencil), its
 * details, its people and what I may do to them, the Encryption section, the bell, and the
 * actions (invite, leave, delete).
 */
export function RoomDetails({
  room,
  onClose,
  onChanged,
  onLeft,
  focusRequest = 0,
  peopleFocus = 0,
  onInvite,
}: RoomDetailsProps) {
  const core = useCore();
  const text = useText();
  const account = useAccount();
  const members = useRoomMembers(room.jid);
  const { people, refresh: refreshPeople } = useRoomPeople(room.jid);
  const { settings, refresh: refreshSettings } = useRoomSettings(room.jid);
  const [error, setError] = useState<MessageKey | null>(null);
  const standing = people.filter((person) => person.affiliation !== 'outcast');

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
      className="flex w-[clamp(240px,var(--details-width,280px),480px)] shrink-0 flex-col gap-5 border-l border-line bg-paper p-4 overflow-y-auto"
      aria-label={text('room.panel')}
    >
      <header className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <HallHero
            room={room}
            settings={settings}
            onSaved={() => {
              void refreshSettings();
              void onChanged();
            }}
          />
        </div>
        <Button variant="ghost" onClick={onClose} aria-label={text('main.closeDetails')}>
          <X size={18} aria-hidden />
        </Button>
      </header>

      <HallFacts
        jid={room.jid}
        visibility={settings?.visibility ?? room.visibility}
        membersCount={standing.length > 0 ? standing.length : undefined}
      />

      <HallPeople
        room={room}
        people={people}
        selfJid={account?.jid ?? ''}
        onChanged={() => void refreshPeople()}
        focusRequest={peopleFocus}
      />

      <RoomEncryption members={members} focusRequest={focusRequest} />

      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className={hallStyles.heading}>{text('room.notify')}</legend>
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
        {error && (
          <p className={`${hallStyles.postie} text-red`} role="alert">
            {text(error)}
          </p>
        )}
      </fieldset>

      <HallActions room={room} onInvite={onInvite} onGone={onLeft} />
    </aside>
  );
}
