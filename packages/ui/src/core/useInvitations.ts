import type { Contact, RoomInvitation } from '@hey-postie/core';
import { useCallback, useState } from 'react';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * The invitations to halls waiting for an answer, newest first. The service keeps them
 * (`rooms.invitations()`); this re-reads them on `room.invited`, on `room.destroyed` (a hall that
 * is gone takes its invitation with it) and after an answer (`refresh`).
 */
export function useInvitations(): { invitations: RoomInvitation[]; refresh: () => void } {
  const core = useCore();
  const [invitations, setInvitations] = useState(() => core.rooms.invitations());
  const refresh = useCallback(() => setInvitations(core.rooms.invitations()), [core]);
  useCoreEvent('room.invited', refresh);
  useCoreEvent('room.destroyed', refresh);
  return { invitations, refresh };
}

/** Who invited: the contact's name when known, else the address (or the hall seat) as given. */
export function inviterName(invitation: RoomInvitation, contacts: Contact[]): string {
  const bare = invitation.fromJid.split('/')[0] ?? invitation.fromJid;
  return contacts.find((contact) => contact.jid === bare)?.name ?? invitation.fromJid;
}

/** An invitation names the hall by its address only: its local part stands for the name. */
export function hallNameOf(roomJid: string): string {
  return roomJid.split('@')[0] || roomJid;
}
