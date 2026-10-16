import type { RoomInvitationRepository } from '../../contracts/repositories';
import type { RoomInvitation } from '../../contracts/types';
import type { ConverseEngine } from './engine';

const CONFERENCE = 'jabber:x:conference';
const MUC_USER = 'http://jabber.org/protocol/muc#user';
/** When to look for the stray chat: Converse files the message asynchronously. */
const STRAY_CHAT_CHECKS_MS = [0, 100, 400, 1500];

type Handler = (invitation: RoomInvitation) => void;

/**
 * Invitations to halls, both kinds: direct (XEP-0249, `jabber:x:conference` from the inviter)
 * and mediated (XEP-0045 §7.8.2, `muc#user/invite` from the room, which Prosody also dresses as a
 * direct one). Converse would lose the inviter and the password of a mediated one, and never joins
 * by itself (`auto_join_on_invite` is off): our own handler reads them.
 */
export class ConverseRoomInvitationRepository implements RoomInvitationRepository {
  private readonly handlers = new Set<Handler>();
  private handler: unknown = null;

  constructor(private readonly engine: ConverseEngine) {
    for (const event of ['connected', 'reconnected']) {
      engine.on(event, () => this.listen());
    }
  }

  onInvitation(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Only a mediated invitation can be declined: through the room, to the inviter (§7.8.2). */
  async decline(invitation: RoomInvitation): Promise<void> {
    const { api, env } = await this.engine.ready();
    api.send(
      env.stx`<message to="${invitation.roomJid}" xmlns="jabber:client"><x xmlns="${MUC_USER}"><decline to="${invitation.fromJid}"/></x></message>`,
    );
  }

  /**
   * Prosody's mediated invitation carries a fallback body, which Converse files as a direct chat
   * with the hall's address (`plugins/chat/utils.js:124-155`). Such a chat never makes sense: it
   * is closed as soon as it appears (Converse creates it a moment after our handler runs).
   */
  private async closeStrayChat(roomJid: string): Promise<void> {
    const api = this.engine.current?.api;
    if (!api) return;
    for (const delay of STRAY_CHAT_CHECKS_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const chat = await api.chats.get(roomJid);
      if (chat && chat.get('type') === 'chatbox') {
        await chat.close?.();
        return;
      }
    }
  }

  private listen(): void {
    const connection = this.engine.current?.api.connection.get();
    if (!connection) return;
    if (this.handler) connection.deleteHandler(this.handler);
    this.handler = connection.addHandler(
      (stanza: Element) => {
        const invitation = parseInvitation(stanza);
        if (!invitation) return true;
        for (const handler of this.handlers) handler(invitation);
        if (isMediated(stanza)) void this.closeStrayChat(invitation.roomJid);
        return true;
      },
      null,
      'message',
      null,
      null,
      null,
    );
  }
}

/** A mediated invitation comes from the room itself, with a `muc#user` invite. */
function isMediated(stanza: Element): boolean {
  return stanza.getElementsByTagNameNS(MUC_USER, 'invite').length > 0;
}

/** The invitation a `<message>` carries, mediated first (it names the real inviter), else direct. */
export function parseInvitation(stanza: Element): RoomInvitation | null {
  const from = (stanza.getAttribute('from') ?? '').split('/')[0]?.toLowerCase() ?? '';
  const user = stanza.getElementsByTagNameNS(MUC_USER, 'x')[0];
  const invite = user?.getElementsByTagNameNS(MUC_USER, 'invite')[0];
  if (user && invite) {
    // In a semi-anonymous hall the server names the inviter by their seat (`room/nick`), not
    // their real address: keep the seat, since its bare part would only be the room.
    const raw = invite.getAttribute('from') ?? '';
    const bare = raw.split('/')[0]?.toLowerCase() ?? '';
    const inviter = bare === from ? raw : bare;
    if (!from || !inviter) return null;
    return withOptional(
      { roomJid: from, fromJid: inviter },
      invite.getElementsByTagNameNS(MUC_USER, 'reason')[0]?.textContent,
      user.getElementsByTagNameNS(MUC_USER, 'password')[0]?.textContent,
    );
  }
  const direct = stanza.getElementsByTagNameNS(CONFERENCE, 'x')[0];
  const roomJid = direct?.getAttribute('jid')?.toLowerCase();
  if (!direct || !roomJid || !from) return null;
  return withOptional(
    { roomJid, fromJid: from },
    direct.getAttribute('reason'),
    direct.getAttribute('password'),
  );
}

function withOptional(
  base: RoomInvitation,
  reason: string | null | undefined,
  password: string | null | undefined,
): RoomInvitation {
  return {
    ...base,
    ...(reason ? { reason } : {}),
    ...(password ? { password } : {}),
  };
}
