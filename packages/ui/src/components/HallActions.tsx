import type { Room } from '@hey-postie/core';
import { DoorOpen, Trash2, UserPlus } from 'lucide-react';
import { useId, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import { DeleteHallDialog } from './DeleteHallDialog';
import { hallStyles } from './hallStyles';
import { LeaveRoomDialog } from './LeaveRoomDialog';

interface HallActionsProps {
  room: Room;
  /** Opens the invite dialog on this hall; offered while joined. */
  onInvite?: (() => void) | undefined;
  /** After leaving or deleting: Main drops the selection. */
  onGone: () => void;
}

/**
 * The Actions part of the hall panel: Invite people (while joined), Leave the hall… and, for its
 * owner, Delete the hall…; the last two through their confirmation dialogs.
 */
export function HallActions({ room, onInvite, onGone }: HallActionsProps) {
  const text = useText();
  const headingId = useId();
  const [confirming, setConfirming] = useState<'leave' | 'delete' | null>(null);
  return (
    <section className="flex flex-col items-start gap-2" aria-labelledby={headingId}>
      <h3 id={headingId} className={hallStyles.heading}>
        {text('room.actions')}
      </h3>
      {onInvite && room.joined && (
        <Button onClick={onInvite}>
          <UserPlus size={16} aria-hidden />
          {text('room.invite')}
        </Button>
      )}
      <Button variant="danger" onClick={() => setConfirming('leave')}>
        <DoorOpen size={16} aria-hidden />
        {text('room.leaveMenu')}
      </Button>
      {room.affiliation === 'owner' && (
        <Button variant="danger" onClick={() => setConfirming('delete')}>
          <Trash2 size={16} aria-hidden />
          {text('room.deleteMenu')}
        </Button>
      )}
      {confirming === 'leave' && (
        <LeaveRoomDialog room={room} onClose={() => setConfirming(null)} onLeft={onGone} />
      )}
      {confirming === 'delete' && (
        <DeleteHallDialog room={room} onClose={() => setConfirming(null)} onDeleted={onGone} />
      )}
    </section>
  );
}
