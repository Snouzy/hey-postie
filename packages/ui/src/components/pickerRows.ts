import { type Contact, domainOf, normalizeJid, type Presence, type Room } from '@hey-postie/core';

/** One row of the "New chat" picker, in the order the list shows them. */
export type PickerRow =
  | { kind: 'contact'; contact: Contact }
  | { kind: 'room'; room: Room }
  | {
      /** The last row: whatever was typed, taken as an address. */
      kind: 'address';
      jid: string;
      /** A hall when the address is on the account's conference service or is a known hall. */
      target: 'chat' | 'room';
      /** False when the text is not an address at all; picking it still asks the service. */
      valid: boolean;
    };

interface PickerInput {
  query: string;
  contacts: Contact[];
  /** The joined or bookmarked halls, as `useRooms` gives them. */
  rooms: Room[];
  /** The account's conference service (`rooms.roomService`), when the server named one. */
  roomService: string | null;
}

const PRESENCE_RANK: Record<Presence, number> = { online: 0, away: 1, dnd: 2, offline: 3 };

/**
 * The contacts whose name or address contains the text (online first, then by name), the halls
 * whose name or address contains it (the service's order), then the typed text as an address
 * when there is one. An empty text lists everyone and every hall, without the last row.
 */
export function pickerRows({ query, contacts, rooms, roomService }: PickerInput): PickerRow[] {
  const needle = query.trim().toLowerCase();
  const matches = (name: string, jid: string) =>
    needle === '' || name.toLowerCase().includes(needle) || jid.toLowerCase().includes(needle);

  const people = contacts
    .filter((contact) => matches(contact.name, contact.jid))
    .sort(
      (a, b) =>
        PRESENCE_RANK[a.presence] - PRESENCE_RANK[b.presence] || a.name.localeCompare(b.name),
    )
    .map((contact): PickerRow => ({ kind: 'contact', contact }));
  const halls = rooms
    .filter((room) => matches(room.name, room.jid))
    .map((room): PickerRow => ({ kind: 'room', room }));

  const rows = [...people, ...halls];
  if (needle !== '') rows.push(addressRow(query.trim(), rooms, roomService));
  return rows;
}

function addressRow(typed: string, rooms: Room[], roomService: string | null): PickerRow {
  let normalized: string | null = null;
  try {
    normalized = normalizeJid(typed);
  } catch {
    // Not an address: the row stays, the service will say so when it is picked.
  }
  const isRoom =
    normalized !== null &&
    ((roomService !== null && domainOf(normalized) === roomService) ||
      rooms.some((room) => room.jid === normalized));
  return { kind: 'address', jid: typed, target: isRoom ? 'room' : 'chat', valid: !!normalized };
}
