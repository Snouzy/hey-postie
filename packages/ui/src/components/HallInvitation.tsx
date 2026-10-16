import type { Contact, Room, RoomInvitation } from '@hey-postie/core';
import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { hallNameOf, inviterName } from '../core/useInvitations';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';

interface HallInvitationProps {
  invitation: RoomInvitation;
  /** The address book, to name who invited. */
  contacts: Contact[];
  /** Joined and bookmarked: the caller opens the hall. */
  onJoined: (room: Room) => void;
  /** Declined (the inviter is told through the hall): the caller closes this screen. */
  onDeclined: () => void;
}

const NOTE = "m-0 font-heading [font-variation-settings:'SOFT'_100] text-[14px]";

/**
 * An invitation to a hall, in place of a conversation: the hall's address, who invited, their
 * reason quoted (their text, never Postie's voice), then "Join" and "Decline". Nothing of the
 * hall is read before joining: XMPP lets no one look in from the door.
 */
export function HallInvitation({
  invitation,
  contacts,
  onJoined,
  onDeclined,
}: HallInvitationProps) {
  const core = useCore();
  const text = useText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const name = hallNameOf(invitation.roomJid);
  const inviter = invitation.fromJid.split('/')[0] ?? invitation.fromJid;
  // A hall that hides real addresses gives its seat (`hall@service/nick`): unknown, not a stranger.
  const stranger =
    inviter !== invitation.roomJid && !contacts.some((contact) => contact.jid === inviter);

  async function run<T>(action: () => Promise<T>, then: (result: T) => void) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      then(await action());
    } catch (caught) {
      setBusy(false);
      setError(errorKey(caught));
    }
  }

  return (
    // `min-h-0`: the column never outgrows the window (see Conversation).
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-paper" aria-label={name}>
      {/* The invitation card, on kraft like the requests at the door. */}
      <div className="m-4 flex flex-col gap-2 bg-kraft-soft p-4">
        <h2 className="m-0 text-[20px] wrap-anywhere">{name}</h2>
        <p className="m-0 font-mono text-[13px] text-ink-muted wrap-anywhere">
          {invitation.roomJid}
        </p>
        <p className={NOTE}>
          {text('invitation.explain').replace('{name}', inviterName(invitation, contacts))}
        </p>
        {stranger && (
          <p className="m-0 text-[13px] text-ink-muted">{text('invitation.stranger')}</p>
        )}
        {invitation.reason && (
          // Their reason is text, never Postie's voice.
          <blockquote className="m-0 flex flex-col gap-1 rounded-sm border-l-[3px] border-line bg-paper px-3 py-2">
            <span className="text-[12px] font-bold tracking-[0.04em] text-ink-muted uppercase">
              {text('invitation.reason')}
            </span>
            <span className="whitespace-pre-wrap wrap-anywhere">{invitation.reason}</span>
          </blockquote>
        )}
        <p className={`${NOTE} text-ink-muted`}>{text('invitation.joining')}</p>
        {error && (
          <p className={`${NOTE} px-0 py-2 text-red`} role="alert">
            {text(error)}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() =>
              void run(() => core.rooms.acceptInvitation(invitation.roomJid), onJoined)
            }
            disabled={busy}
            aria-busy={busy}
          >
            {text('invitation.join')}
          </Button>
          <Button
            onClick={() =>
              void run(() => core.rooms.declineInvitation(invitation.roomJid), onDeclined)
            }
            disabled={busy}
          >
            {text('invitation.decline')}
          </Button>
        </div>
      </div>
    </section>
  );
}
