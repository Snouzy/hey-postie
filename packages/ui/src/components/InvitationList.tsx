import type { Contact, RoomInvitation } from '@hey-postie/core';
import { useText } from '../core/CoreProvider';
import { hallNameOf, inviterName } from '../core/useInvitations';
import { moveWithArrows } from './ChatList';
import { GROUP_ROW } from './SidebarGroup';

interface InvitationListProps {
  invitations: RoomInvitation[];
  /** The address book, to name who invited. */
  contacts: Contact[];
  selectedJid: string | null;
  onSelect: (invitation: RoomInvitation) => void;
}

/**
 * The rows of the "Invitations" group: the hall, then who invited. Their reason is not shown
 * here, only on the invitation's own screen. Arrow keys move between rows like in the chat list.
 */
export function InvitationList({
  invitations,
  contacts,
  selectedJid,
  onSelect,
}: InvitationListProps) {
  const text = useText();
  return (
    <ul className="m-0 flex list-none flex-col gap-[2px] px-2 py-0" onKeyDown={moveWithArrows}>
      {invitations.map((invitation) => (
        <li key={invitation.roomJid}>
          <button
            type="button"
            data-row=""
            className={GROUP_ROW}
            aria-current={invitation.roomJid === selectedJid ? 'true' : undefined}
            onClick={() => onSelect(invitation)}
          >
            <span className="w-full truncate font-semibold">{hallNameOf(invitation.roomJid)}</span>
            <span className="w-full truncate text-[13px] text-ink-muted">
              {text('invitation.from').replace('{name}', inviterName(invitation, contacts))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
