import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import { DomainError } from '../contracts/errors';
import type { Room } from '../contracts/types';
import { createFakeDependencies } from '../fakes';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

describe('rooms.join', () => {
  it('normalizes the room jid, trims the nick, joins and bookmarks', async () => {
    const room = await core.rooms.join({ jid: ' Hall@Rooms.localhost ', nick: ' alice ' });
    expect(room.jid).toBe('hall@rooms.localhost');
    expect(room.nick).toBe('alice');
    expect(deps.fakes.room.joined).toEqual(['hall@rooms.localhost']);
    const listed = await core.rooms.list();
    expect(listed[0]?.bookmarked).toBe(true);
  });

  it('refuses an empty nick without joining', async () => {
    await expect(core.rooms.join({ jid: 'hall@rooms.localhost', nick: '  ' })).rejects.toThrow(
      /InvalidNick/,
    );
    expect(deps.fakes.room.joined).toEqual([]);
  });

  it('passes the server refusal through as a domain error', async () => {
    deps.fakes.room.refusals.set('secret@rooms.localhost', new DomainError('RoomPasswordRequired'));
    await expect(core.rooms.join({ jid: 'secret@rooms.localhost', nick: 'a' })).rejects.toThrow(
      /RoomPasswordRequired/,
    );
  });

  it('emits room.updated', async () => {
    const seen: Room[] = [];
    core.events.on('room.updated', (r) => seen.push(r));
    await core.rooms.join({ jid: 'hall@rooms.localhost', nick: 'a' });
    expect(seen.at(-1)?.joined).toBe(true);
  });
});

describe('rooms.leave', () => {
  it('removes the bookmark and leaves', async () => {
    await core.rooms.join({ jid: 'hall@rooms.localhost', nick: 'a' });
    await core.rooms.leave('hall@rooms.localhost');
    expect(deps.fakes.room.left).toEqual(['hall@rooms.localhost']);
    const listed = await core.rooms.list();
    expect(listed[0]).toMatchObject({ joined: false, bookmarked: false });
  });
});

describe('rooms.list', () => {
  it('sorts by name', async () => {
    await core.rooms.join({ jid: 'zebra@rooms.localhost', nick: 'a' });
    await core.rooms.join({ jid: 'alpha@rooms.localhost', nick: 'a' });
    expect((await core.rooms.list()).map((r) => r.name)).toEqual(['alpha', 'zebra']);
  });
});

describe('rooms.browse', () => {
  it('lists the public rooms of a normalized domain', async () => {
    deps.fakes.room.publish('rooms.localhost', [{ jid: 'hall@rooms.localhost', name: 'Hall' }]);
    expect(await core.rooms.browse(' Rooms.localhost ')).toHaveLength(1);
  });

  it('refuses something that is not a domain', async () => {
    await expect(core.rooms.browse('not a domain')).rejects.toThrow(/InvalidJid/);
  });
});

describe('rooms.roomService', () => {
  it('returns the discovered conference service, or null', async () => {
    deps.fakes.room.services.set('localhost', 'rooms.localhost');
    expect(await core.rooms.roomService(' Localhost ')).toBe('rooms.localhost');
    expect(await core.rooms.roomService('other.org')).toBeNull();
  });
});

describe('rooms.members', () => {
  it('emits room.members when the server reports a change', async () => {
    const seen: number[] = [];
    core.events.on('room.members', ({ members }) => seen.push(members.length));
    deps.fakes.room.setMembers('hall@rooms.localhost', [
      { nick: 'bob', role: 'participant', affiliation: 'member' },
    ]);
    expect(seen).toEqual([1]);
    expect(await core.rooms.members('hall@rooms.localhost')).toHaveLength(1);
  });
});
