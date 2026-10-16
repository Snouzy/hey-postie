import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { RoomsService } from '../contracts/services';
import type { Room, RoomAffiliation, RoomInvitation, RoomPerson } from '../contracts/types';
import { domainOf, normalizeJid } from './jid';

type Admin = Pick<
  RoomsService,
  | 'create'
  | 'suggestAddress'
  | 'settings'
  | 'configure'
  | 'setTopic'
  | 'invite'
  | 'people'
  | 'setRole'
  | 'destroy'
  | 'invitations'
  | 'acceptInvitation'
  | 'declineInvitation'
>;

const MAX_NAME = 64;
const ADDRESS = /^[a-z0-9._-]{1,64}$/;
/** Owners first, the banned last. */
const RANK: Record<RoomAffiliation, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  none: 3,
  outcast: 4,
};

const bare = (jid: string) => normalizeJid(jid).split('/')[0] ?? '';

/**
 * Halls the Slack way (spec 2026-10-16-halls-slack-design): create, configure, invite, manage
 * people, destroy, and the invitations received. The server enforces the rights too; the checks
 * here only spare a round trip and give Postie's sentence. Logs never carry names or reasons.
 */
export function createRoomAdmin(
  deps: Pick<CoreDependencies, 'room' | 'roomAdmin' | 'invitations' | 'chat' | 'roster'>,
  events: EventBus,
): Admin {
  const pending = new Map<string, RoomInvitation>();

  deps.roomAdmin.onDestroyed((jid, reason) => {
    void deps.room.setBookmarked(jid, false).catch(() => undefined);
    pending.delete(jid);
    events.emit('room.destroyed', reason === undefined ? { jid } : { jid, reason });
  });

  deps.invitations.onInvitation((invitation) => {
    void (async () => {
      const blocked = await deps.roster.blocked().catch(() => [] as string[]);
      if (blocked.includes(bare(invitation.fromJid))) return;
      pending.set(invitation.roomJid, invitation);
      events.emit('room.invited', invitation);
    })();
  });

  const self = () => deps.chat.selfJid();
  const room = async (jid: string): Promise<Room | undefined> =>
    (await deps.room.list()).find((candidate) => candidate.jid === jid);
  /** A known standing that is not the one needed: refused here; unknown: the server decides. */
  const require = async (jid: string, allowed: RoomAffiliation[]) => {
    const mine = (await room(jid))?.affiliation;
    if (mine && !allowed.includes(mine))
      throw new DomainError('NotAllowed', 'NotAllowed: not enough rights');
  };

  function suggestAddress(name: string): string {
    const slug = name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, MAX_NAME);
    return slug || 'hall';
  }

  function checkName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > MAX_NAME) throw new DomainError('InvalidRoomName');
    return trimmed;
  }

  return {
    suggestAddress,

    async create({ name, address, description, visibility }) {
      const trimmed = checkName(name);
      const localpart = address?.trim().toLowerCase() || suggestAddress(trimmed);
      if (!ADDRESS.test(localpart)) throw new DomainError('InvalidJid', 'InvalidJid: hall address');
      const service = await deps.room.roomService(domainOf(self()));
      if (!service) throw new DomainError('NotAllowed', 'NotAllowed: no hall service');
      const created = await deps.roomAdmin.create({
        service,
        localpart,
        nick: self().split('@')[0] ?? 'me',
        settings: { name: trimmed, description: description?.trim() ?? '', visibility },
      });
      if (!created.bookmarked)
        await deps.room.setBookmarked(created.jid, true).catch(() => undefined);
      return created;
    },

    settings(jid) {
      return deps.roomAdmin.settings(bare(jid));
    },

    async configure(jid, change) {
      const roomJid = bare(jid);
      await require(roomJid, ['owner']);
      const name = change.name === undefined ? {} : { name: checkName(change.name) };
      const description =
        change.description === undefined ? {} : { description: change.description.trim() };
      await deps.roomAdmin.configure(roomJid, { ...change, ...name, ...description });
    },

    setTopic(jid, topic) {
      return deps.roomAdmin.setTopic(bare(jid), topic.trim());
    },

    async invite(jid, jids) {
      const roomJid = bare(jid);
      const invitees = jids.map(bare);
      for (const invitee of invitees) await deps.roomAdmin.invite(roomJid, invitee);
    },

    async people(jid) {
      const roomJid = bare(jid);
      const [members, affiliates] = await Promise.all([
        deps.room.members(roomJid),
        // Only admins may read the lists: anyone else sees who is present.
        deps.roomAdmin.affiliations(roomJid).catch(() => []),
      ]);
      const present: RoomPerson[] = members.map((member) => ({
        nick: member.nick,
        ...(member.jid ? { jid: member.jid } : {}),
        role: member.role,
        affiliation: member.affiliation,
        present: true,
      }));
      const here = new Set(present.flatMap((person) => (person.jid ? [bare(person.jid)] : [])));
      const away: RoomPerson[] = affiliates
        .filter((affiliate) => !here.has(bare(affiliate.jid)))
        .map((affiliate) => ({
          jid: affiliate.jid,
          ...(affiliate.nick ? { nick: affiliate.nick } : {}),
          affiliation: affiliate.affiliation,
          present: false,
        }));
      const label = (person: RoomPerson) => (person.nick ?? person.jid ?? '').toLowerCase();
      return [...present, ...away].sort(
        (a, b) =>
          Number(b.present) - Number(a.present) ||
          RANK[a.affiliation] - RANK[b.affiliation] ||
          label(a).localeCompare(label(b)),
      );
    },

    async setRole(jid, person, change) {
      const roomJid = bare(jid);
      const mine = await room(roomJid);
      const isSelf =
        (person.jid !== undefined && bare(person.jid) === self()) ||
        (person.present && person.nick !== undefined && person.nick === mine?.nick);
      if (isSelf) throw new DomainError('NotAllowed', 'NotAllowed: not on oneself');
      await require(roomJid, change === 'admin' || change === 'member'
        ? ['owner']
        : ['owner', 'admin']);
      if (person.affiliation === 'owner' && mine?.affiliation !== 'owner') {
        throw new DomainError('NotAllowed', 'NotAllowed: an owner');
      }
      if (change === 'remove') {
        if (person.present && person.nick) await deps.roomAdmin.kick(roomJid, person.nick);
        if (person.jid) await deps.roomAdmin.setAffiliation(roomJid, bare(person.jid), 'none');
        return;
      }
      // Standings are kept per real address: an anonymous occupant can only be kicked.
      if (!person.jid) throw new DomainError('NotAllowed', 'NotAllowed: no real address');
      const affiliation: RoomAffiliation = change === 'ban' ? 'outcast' : change;
      await deps.roomAdmin.setAffiliation(roomJid, bare(person.jid), affiliation);
    },

    async destroy(jid, reason) {
      const roomJid = bare(jid);
      await require(roomJid, ['owner']);
      await deps.roomAdmin.destroy(roomJid, reason?.trim() || undefined);
    },

    invitations() {
      return [...pending.values()].reverse();
    },

    async acceptInvitation(roomJid) {
      const invitation = pending.get(bare(roomJid));
      if (!invitation) throw new DomainError('RoomNotFound');
      const nick = self().split('@')[0] ?? 'me';
      const joined = await deps.room.join(
        invitation.password
          ? { jid: invitation.roomJid, nick, password: invitation.password }
          : { jid: invitation.roomJid, nick },
      );
      if (!joined.bookmarked)
        await deps.room.setBookmarked(joined.jid, true).catch(() => undefined);
      pending.delete(invitation.roomJid);
      return joined;
    },

    async declineInvitation(roomJid) {
      const invitation = pending.get(bare(roomJid));
      if (!invitation) return;
      pending.delete(invitation.roomJid);
      await deps.invitations.decline(invitation);
    },
  };
}
