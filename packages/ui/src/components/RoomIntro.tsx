import type { Room } from '@hey-postie/core';
import { UserPlus } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import { useRoomSettings } from '../core/useRoomSettings';
import { Button } from './Button';

interface RoomIntroProps {
  room: Room;
  /** Opens the invite dialog on this hall; without it, no button. */
  onInvite?: (() => void) | undefined;
}

/**
 * The top of a hall with no letter yet, in place of the blank page: "This is the beginning of
 * …", the hall's description when the server tells it, and "Invite people".
 */
export function RoomIntro({ room, onInvite }: RoomIntroProps) {
  const text = useText();
  // The description lives in the hall's configuration; a hall that will not say has none here.
  const description = useRoomSettings(room.jid).settings?.description ?? '';

  return (
    <div className="flex flex-col items-start gap-2 px-0 pt-4 pb-2">
      <h3 className="m-0 text-[22px] wrap-anywhere">
        {text('roomIntro.title').replace('{name}', room.name)}
      </h3>
      {description && <p className="m-0 whitespace-pre-wrap wrap-anywhere">{description}</p>}
      <p className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-ink-muted">
        {text('roomIntro.hint')}
      </p>
      {onInvite && (
        <Button className="mt-1" onClick={onInvite}>
          <UserPlus size={16} aria-hidden />
          {text('room.invite')}
        </Button>
      )}
    </div>
  );
}
