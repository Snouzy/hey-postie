import type { CoreDependencies } from '../container';
import type { EventBus } from '../contracts/events';
import type { ContactsService } from '../contracts/services';
import { normalizeJid } from './jid';

export function createContactsService(
  deps: Pick<CoreDependencies, 'roster'>,
  events: EventBus,
): ContactsService {
  deps.roster.onChange((contact) => events.emit('contact.updated', contact));
  return {
    async list() {
      const contacts = await deps.roster.list();
      return contacts.sort(byPresenceThenName);
    },
    async add({ jid, name }) {
      const normalized = normalizeJid(jid).split('/')[0] ?? '';
      const trimmed = name?.trim();
      return deps.roster.add(normalized, trimmed ? trimmed : undefined);
    },
    async remove(jid) {
      return deps.roster.remove(normalizeJid(jid));
    },
  };
}

const PRESENCE_ORDER = { online: 0, away: 1, dnd: 2, offline: 3 } as const;

function byPresenceThenName(
  a: { presence: keyof typeof PRESENCE_ORDER; name: string },
  b: typeof a,
) {
  const presence = PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence];
  return presence !== 0 ? presence : a.name.localeCompare(b.name);
}
