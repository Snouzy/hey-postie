import type { Chat, RoomInvitation } from '@hey-postie/core';
import { useState } from 'react';
import { isRequest, type RequestRow } from '../core/useRequests';

/**
 * What the middle column shows: a chat, a message request or a hall invitation, one at a time.
 * The lists are the fresh source once the chosen item is in them (title, unread count).
 */
export function useMainSelection(
  chats: Chat[],
  requestRows: RequestRow[],
  invitations: RoomInvitation[],
) {
  const [selected, setSelected] = useState<Chat | null>(null);
  const [requestJid, setRequestJid] = useState<string | null>(null); // the open message request
  const [invitationJid, setInvitationJid] = useState<string | null>(null); // the open invitation

  const invitation = invitationJid
    ? invitations.find((candidate) => candidate.roomJid === invitationJid)
    : undefined;
  const selectedChat = selected ? (chats.find((c) => c.id === selected.id) ?? selected) : null;
  // A stranger's chat shows the request screen, even if their letter came while it was open.
  const wanted =
    requestJid ?? (selectedChat && isRequest(selectedChat) ? selectedChat.peerJid : null);
  const request = wanted ? requestRows.find((row) => row.jid === wanted) : undefined;
  const chat = request || invitation ? null : selectedChat;

  /** A chat from the list, or a stranger's chat that belongs to the requests group. */
  function select(next: Chat) {
    setRequestJid(isRequest(next) ? next.peerJid : null);
    setInvitationJid(null);
    setSelected(next);
  }

  function selectRequest(row: RequestRow) {
    setRequestJid(row.jid);
    setInvitationJid(null);
    setSelected(null);
  }

  function selectInvitation(next: RoomInvitation) {
    setInvitationJid(next.roomJid);
    setRequestJid(null);
    setSelected(null);
  }

  return {
    selected,
    chat,
    request,
    invitation,
    select,
    selectRequest,
    selectInvitation,
    /** A hall left or destroyed: nothing selected any more. */
    deselect: () => setSelected(null),
    /** A request ignored or blocked: back to the empty screen. */
    closeRequest: () => {
      setRequestJid(null);
      setSelected(null);
    },
    closeInvitation: () => setInvitationJid(null),
  };
}
