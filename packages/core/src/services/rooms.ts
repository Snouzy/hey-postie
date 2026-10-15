import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { RoomsService } from '../contracts/services';
import { normalizeJid } from './jid';

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

export function createRoomsService(
  deps: Pick<CoreDependencies, 'room'>,
  events: EventBus,
): RoomsService {
  deps.room.onChange((room) => events.emit('room.updated', room));
  deps.room.onMembersChange((jid, members) => events.emit('room.members', { jid, members }));

  return {
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
      if (!room.bookmarked) await deps.room.setBookmarked(roomJid, true);
      return room;
    },
    async leave(jid) {
      const roomJid = normalizeJid(jid).split('/')[0] ?? '';
      await deps.room.setBookmarked(roomJid, false);
      await deps.room.leave(roomJid);
    },
    members(jid) {
      return deps.room.members(normalizeJid(jid).split('/')[0] ?? '');
    },
    setNotify(jid, rule) {
      return deps.room.setNotify(normalizeJid(jid).split('/')[0] ?? '', rule);
    },
    async browse(domain) {
      const trimmed = domain.trim().toLowerCase();
      if (!DOMAIN.test(trimmed)) throw new DomainError('InvalidJid', 'InvalidJid: not a domain');
      return deps.room.browse(trimmed);
    },
  };
}
