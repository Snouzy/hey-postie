import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import { DomainError } from '../contracts/errors';
import type { Room, RoomInvitation } from '../contracts/types';
import { createFakeDependencies } from '../fakes';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
  deps.fakes.chat.myJid = 'me@example.org';
  deps.fakes.room.services.set('example.org', 'rooms.example.org');
});

function hall(overrides: Partial<Room> = {}): Room {
  return {
    jid: 'team@rooms.example.org',
    name: 'Team',
    nick: 'me',
    joined: true,
    bookmarked: true,
    notify: 'mentions',
    unreadCount: 0,
    mentionsCount: 0,
    ...overrides,
  };
}

describe('creating a hall', () => {
  it('derives a valid address from the name', () => {
    expect(core.rooms.suggestAddress('Release notes')).toBe('release-notes');
    expect(core.rooms.suggestAddress('  Équipe Été 2026!! ')).toBe('equipe-ete-2026');
    expect(core.rooms.suggestAddress('???')).toBe('hall');
  });

  it('creates a private hall on the account’s hall service, as its owner, bookmarked', async () => {
    const created = await core.rooms.create({ name: ' Release notes ', visibility: 'private' });
    expect(created).toMatchObject({
      jid: 'release-notes@rooms.example.org',
      name: 'Release notes',
      affiliation: 'owner',
      visibility: 'private',
      bookmarked: true,
    });
    expect(deps.fakes.roomAdmin.settingsByRoom.get(created.jid)).toEqual({
      name: 'Release notes',
      description: '',
      visibility: 'private',
    });
  });

  it('refuses an empty or too long name, a bad address, and a taken one', async () => {
    await expect(core.rooms.create({ name: '  ', visibility: 'public' })).rejects.toThrow(
      /InvalidRoomName/,
    );
    await expect(core.rooms.create({ name: 'x'.repeat(65), visibility: 'public' })).rejects.toThrow(
      /InvalidRoomName/,
    );
    await expect(
      core.rooms.create({ name: 'Team', address: 'Bad Address', visibility: 'public' }),
    ).rejects.toThrow(/InvalidJid/);
    deps.fakes.roomAdmin.taken.add('team@rooms.example.org');
    await expect(core.rooms.create({ name: 'Team', visibility: 'public' })).rejects.toThrow(
      /RoomExists/,
    );
  });
});

describe('managing a hall', () => {
  it('lets only the owner change the settings', async () => {
    deps.fakes.room.change(hall({ affiliation: 'member' }));
    await expect(core.rooms.configure('team@rooms.example.org', { name: 'New' })).rejects.toThrow(
      /NotAllowed/,
    );
  });

  it('invites each address, validated', async () => {
    deps.fakes.room.change(hall({ affiliation: 'owner' }));
    await core.rooms.invite('team@rooms.example.org', ['Bob@Example.org', 'ann@example.org']);
    expect(deps.fakes.roomAdmin.invited.map((i) => i.inviteeJid)).toEqual([
      'bob@example.org',
      'ann@example.org',
    ]);
    await expect(core.rooms.invite('team@rooms.example.org', ['not a jid'])).rejects.toThrow(
      /InvalidJid/,
    );
  });

  it('lists who is here, then the members who are away, owners first', async () => {
    deps.fakes.room.change(hall({ affiliation: 'owner' }));
    deps.fakes.room.setMembers('team@rooms.example.org', [
      { nick: 'zoe', jid: 'zoe@example.org', role: 'participant', affiliation: 'member' },
      { nick: 'me', jid: 'me@example.org', role: 'moderator', affiliation: 'owner' },
    ]);
    deps.fakes.roomAdmin.affiliates.set('team@rooms.example.org', [
      { jid: 'me@example.org', affiliation: 'owner' },
      { jid: 'ann@example.org', affiliation: 'member' },
    ]);
    const people = await core.rooms.people('team@rooms.example.org');
    expect(people.map((p) => [p.nick ?? p.jid, p.present])).toEqual([
      ['me', true],
      ['zoe', true],
      ['ann@example.org', false],
    ]);
  });

  it('removes someone present (kick and no membership) and never touches oneself', async () => {
    deps.fakes.room.change(hall({ affiliation: 'admin' }));
    const zoe = {
      nick: 'zoe',
      jid: 'zoe@example.org',
      affiliation: 'member',
      present: true,
    } as const;
    await core.rooms.setRole('team@rooms.example.org', zoe, 'remove');
    expect(deps.fakes.roomAdmin.kicked).toEqual([{ jid: 'team@rooms.example.org', nick: 'zoe' }]);
    const me = { nick: 'me', jid: 'me@example.org', affiliation: 'admin', present: true } as const;
    await expect(core.rooms.setRole('team@rooms.example.org', me, 'ban')).rejects.toThrow(
      /NotAllowed/,
    );
    await expect(core.rooms.setRole('team@rooms.example.org', zoe, 'admin')).rejects.toThrow(
      /NotAllowed/,
    );
  });

  it('destroys as the owner only, and the hall leaves the list', async () => {
    deps.fakes.room.change(hall({ affiliation: 'admin' }));
    await expect(core.rooms.destroy('team@rooms.example.org')).rejects.toThrow(/NotAllowed/);
    deps.fakes.room.change(hall({ affiliation: 'owner' }));
    const gone: unknown[] = [];
    core.events.on('room.destroyed', (event) => gone.push(event));
    await core.rooms.destroy('team@rooms.example.org', ' done ');
    expect(gone).toEqual([{ jid: 'team@rooms.example.org', reason: 'done' }]);
  });
});

describe('invitations received', () => {
  const invitation: RoomInvitation = {
    roomJid: 'team@rooms.example.org',
    fromJid: 'bob@example.org',
  };

  it('waits for the answer, joins and bookmarks on yes', async () => {
    const seen: RoomInvitation[] = [];
    core.events.on('room.invited', (event) => seen.push(event));
    deps.fakes.invitations.arrive(invitation);
    await tick();
    expect(seen).toEqual([invitation]);
    expect(core.rooms.invitations()).toEqual([invitation]);
    const joined = await core.rooms.acceptInvitation('team@rooms.example.org');
    expect(joined.joined).toBe(true);
    expect(core.rooms.invitations()).toEqual([]);
  });

  it('sends a decline on no, and drops an invitation from a blocked contact', async () => {
    deps.fakes.invitations.arrive(invitation);
    await tick();
    await core.rooms.declineInvitation('team@rooms.example.org');
    expect(deps.fakes.invitations.declined).toEqual([invitation]);
    await deps.fakes.roster.block('eve@example.org');
    deps.fakes.invitations.arrive({
      roomJid: 'x@rooms.example.org',
      fromJid: 'eve@example.org/phone',
    });
    await tick();
    expect(core.rooms.invitations()).toEqual([]);
    await expect(core.rooms.acceptInvitation('x@rooms.example.org')).rejects.toBeInstanceOf(
      DomainError,
    );
  });
});
