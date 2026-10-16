import type { Contact, Room } from '@hey-postie/core';
import { describe, expect, it } from 'vitest';
import { pickerRows } from './pickerRows';

function contact(overrides: Partial<Contact>): Contact {
  return { jid: 'x@x.org', name: 'x', presence: 'offline', subscription: 'both', ...overrides };
}

function room(overrides: Partial<Room>): Room {
  return {
    jid: 'r@rooms.x.org',
    name: 'r',
    nick: 'alice',
    joined: true,
    bookmarked: true,
    notify: 'mentions',
    unreadCount: 0,
    mentionsCount: 0,
    ...overrides,
  };
}

const CONTACTS = [
  contact({ jid: 'zoe@x.org', name: 'Zoé', presence: 'offline' }),
  contact({ jid: 'bob@x.org', name: 'Bob', presence: 'online' }),
  contact({ jid: 'anna@y.org', name: 'Anna', presence: 'away' }),
  contact({ jid: 'ben@x.org', name: 'Ben', presence: 'online' }),
];
const ROOMS = [
  room({ jid: 'stamps@rooms.x.org', name: 'Stamps' }),
  room({ jid: 'bikes@rooms.x.org', name: 'Bikes' }),
];

const names = (rows: ReturnType<typeof pickerRows>) =>
  rows.map((row) =>
    row.kind === 'contact' ? row.contact.name : row.kind === 'room' ? row.room.name : row.jid,
  );

describe('pickerRows', () => {
  it('lists everyone (online first, then by name) and every hall when nothing is typed', () => {
    const rows = pickerRows({ query: '', contacts: CONTACTS, rooms: ROOMS, roomService: null });
    expect(names(rows)).toEqual(['Ben', 'Bob', 'Anna', 'Zoé', 'Stamps', 'Bikes']);
    expect(rows.some((row) => row.kind === 'address')).toBe(false);
  });

  it('matches names and addresses, ignoring case, contacts before halls', () => {
    const rows = pickerRows({ query: 'B', contacts: CONTACTS, rooms: ROOMS, roomService: null });
    // "Bob", "Ben", "Bikes", plus Zoé whose address does not contain a b: no. Anna: no.
    expect(names(rows)).toEqual(['Ben', 'Bob', 'Bikes', 'B']);
    expect(rows.at(-1)).toEqual({ kind: 'address', jid: 'B', target: 'chat', valid: false });
  });

  it('matches a hall by its address too', () => {
    const rows = pickerRows({
      query: 'rooms.',
      contacts: CONTACTS,
      rooms: ROOMS,
      roomService: null,
    });
    expect(names(rows)).toEqual(['Stamps', 'Bikes', 'rooms.']);
  });

  it('ends with "write to" for a user address', () => {
    const rows = pickerRows({ query: ' Carol@x.org ', contacts: [], rooms: [], roomService: null });
    expect(rows).toEqual([{ kind: 'address', jid: 'Carol@x.org', target: 'chat', valid: true }]);
  });

  it('ends with "join" for an address on the conference service', () => {
    const rows = pickerRows({
      query: 'new@rooms.x.org',
      contacts: [],
      rooms: [],
      roomService: 'rooms.x.org',
    });
    expect(rows.at(-1)).toMatchObject({ kind: 'address', target: 'room', valid: true });
  });

  it('ends with "join" for a known hall typed in full, even without a conference service', () => {
    const rows = pickerRows({
      query: 'Bikes@rooms.x.org',
      contacts: [],
      rooms: ROOMS,
      roomService: null,
    });
    expect(rows.at(-1)).toMatchObject({ kind: 'address', target: 'room', valid: true });
  });

  it('keeps the last row, marked invalid, when the text is not an address', () => {
    const rows = pickerRows({ query: 'nope', contacts: [], rooms: [], roomService: 'rooms.x.org' });
    expect(rows).toEqual([{ kind: 'address', jid: 'nope', target: 'chat', valid: false }]);
  });
});
