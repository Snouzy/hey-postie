import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { RoomsService } from '../contracts/services';
import { normalizeJid } from './jid';
import { createRoomAdmin } from './roomAdmin';

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
/** The longest moderation reason sent; the UI shows the same limit. */
export const MAX_REASON_LENGTH = 140;

export function createRoomsService(
  deps: Pick<CoreDependencies, 'room' | 'roomAdmin' | 'invitations' | 'chat' | 'roster'>,
  events: EventBus,
): RoomsService {
  deps.room.onChange((room) => events.emit('room.updated', room));
  deps.room.onMembersChange((jid, members) => events.emit('room.members', { jid, members }));

  return {
    ...createRoomAdmin(deps, events),
    async list() {
      const rooms = await deps.room.list();
      return rooms.sort((a, b) => a.name.localeCompare(b.name));
    },
    async join({ jid, nick, password }) {
      const roomJid = normalizeJid(jid).split('/')[0] ?? '';
      const trimmedNick = nick.trim();
      if (!trimmedNick || trimmedNick.includes('/') || trimmedNick.length > 64) {
        throw new DomainError('InvalidNick');
      }
      const room = await deps.room.join(
        password
          ? { jid: roomJid, nick: trimmedNick, password }
          : { jid: roomJid, nick: trimmedNick },
      );
      // A server without bookmark storage must not turn a successful join into an error.
      if (!room.bookmarked) await deps.room.setBookmarked(roomJid, true).catch(() => undefined);
      return room;
    },
    async leave(jid) {
      const roomJid = normalizeJid(jid).split('/')[0] ?? '';
      await deps.room.setBookmarked(roomJid, false).catch(() => undefined);
      await deps.room.leave(roomJid);
    },
    members(jid) {
      return deps.room.members(normalizeJid(jid).split('/')[0] ?? '');
    },
    setNotify(jid, rule) {
      return deps.room.setNotify(normalizeJid(jid).split('/')[0] ?? '', rule);
    },
    async roomService(domain) {
      const trimmed = domain.trim().toLowerCase();
      if (!DOMAIN.test(trimmed)) throw new DomainError('InvalidJid', 'InvalidJid: not a domain');
      return deps.room.roomService(trimmed);
    },
    async moderate(jid, messageId, reason) {
      const roomJid = normalizeJid(jid).split('/')[0] ?? '';
      const trimmed = reason?.trim() ?? '';
      if (trimmed.length > MAX_REASON_LENGTH) {
        throw new DomainError('StatusTooLong', `StatusTooLong: limit ${MAX_REASON_LENGTH}`);
      }
      const room = (await deps.room.list()).find((candidate) => candidate.jid === roomJid);
      const me = room && (await deps.room.members(roomJid)).find((m) => m.nick === room.nick);
      if (me?.role !== 'moderator') {
        throw new DomainError('NotAllowed', 'NotAllowed: not a moderator of this hall');
      }
      await deps.room.moderate(roomJid, messageId, trimmed || undefined);
    },
    async browse(domain) {
      const trimmed = domain.trim().toLowerCase();
      if (!DOMAIN.test(trimmed)) throw new DomainError('InvalidJid', 'InvalidJid: not a domain');
      return deps.room.browse(trimmed);
    },
  };
}
