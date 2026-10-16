import type { CoreDependencies } from '../container';
import type { EventBus } from '../contracts/events';
import type { ContactsService } from '../contracts/services';
import type { Chat, Contact, ContactRequest } from '../contracts/types';
import { normalizeJid } from './jid';
import { stripControlCharacters } from './text';

/** The longest sentence a stranger may attach to a request; the rest is cut. */
export const MAX_REQUEST_MESSAGE_LENGTH = 280;

export function createContactsService(
  deps: Pick<CoreDependencies, 'roster'>,
  events: EventBus,
): ContactsService {
  deps.roster.onChange((contact) => events.emit('contact.updated', contact));
  deps.roster.onRequest((request) => events.emit('contact.requested', cleanRequest(request)));
  deps.roster.onBlockedChange((jids) => events.emit('contacts.blocked', sortedBareJids(jids)));
  return {
    async list() {
      const contacts = await deps.roster.list();
      return contacts.sort(byPresenceThenName);
    },
    async add({ jid, name }) {
      const trimmed = name?.trim();
      return deps.roster.add(bareJid(jid), trimmed ? trimmed : undefined);
    },
    async remove(jid) {
      return deps.roster.remove(normalizeJid(jid));
    },
    async requests() {
      const requests = await deps.roster.requests();
      return requests.map(cleanRequest);
    },
    async accept(jid) {
      return deps.roster.accept(bareJid(jid));
    },
    async ignore(jid) {
      return deps.roster.decline(bareJid(jid));
    },
    async block(jid) {
      const bare = bareJid(jid);
      // The blocklist first, so that nothing slips in while the roster entry goes.
      await deps.roster.block(bare);
      const contacts = await deps.roster.list();
      if (contacts.some((c) => c.jid === bare)) await deps.roster.remove(bare);
    },
    async unblock(jid) {
      return deps.roster.unblock(bareJid(jid));
    },
    async blocked() {
      return sortedBareJids(await deps.roster.blocked());
    },
  };
}

/** The blocklist comes from the server: bare, lowercase, no duplicates, in a stable order. */
function sortedBareJids(jids: string[]): string[] {
  return [...new Set(jids.map((jid) => jid.toLowerCase().split('/')[0] ?? ''))]
    .filter(Boolean)
    .sort();
}

/**
 * The rule behind message requests (decision of 2026-10-16): the peer of a direct chat who is not
 * in the roster is a stranger, whatever the state of a pending request. Rooms are never strangers.
 */
export function isStranger(contacts: Contact[], chat: Pick<Chat, 'kind' | 'peerJid'>): boolean {
  return chat.kind === 'direct' && !contacts.some((c) => c.jid === chat.peerJid);
}

/** The name and the sentence come from the stranger: no control characters, bounded. */
function cleanRequest(request: ContactRequest): ContactRequest {
  const name = stripControlCharacters(request.name).trim();
  const message = stripControlCharacters(request.message ?? '')
    .trim()
    .slice(0, MAX_REQUEST_MESSAGE_LENGTH);
  const clean: ContactRequest = {
    jid: request.jid,
    name: name || (request.jid.split('@')[0] ?? request.jid),
  };
  if (message) clean.message = message;
  return clean;
}

function bareJid(jid: string): string {
  return normalizeJid(jid).split('/')[0] ?? '';
}

const PRESENCE_ORDER = { online: 0, away: 1, dnd: 2, offline: 3 } as const;

function byPresenceThenName(
  a: { presence: keyof typeof PRESENCE_ORDER; name: string },
  b: typeof a,
) {
  const presence = PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence];
  return presence !== 0 ? presence : a.name.localeCompare(b.name);
}
