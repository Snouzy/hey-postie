import type { FakeDependencies, Room } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { writeWelcomed } from '../core/settings';
import { setupCore } from '../test-utils';

const TEAM = 'team@rooms.x.org';
const BOB = { jid: 'bob@x.org', name: 'Bob', presence: 'online', subscription: 'both' } as const;
const CAROL = {
  jid: 'carol@x.org',
  name: 'Carol',
  presence: 'offline',
  subscription: 'both',
} as const;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function hall(overrides: Partial<Room> = {}): Room {
  return {
    jid: TEAM,
    name: 'Team',
    nick: 'alice',
    joined: true,
    bookmarked: true,
    notify: 'mentions',
    unreadCount: 0,
    mentionsCount: 0,
    ...overrides,
  };
}

/** Signed in as alice on x.org, whose halls live on rooms.x.org; Bob and Carol in the book. */
async function signedIn(before: (deps: FakeDependencies) => void = () => {}) {
  const { deps, core } = setupCore();
  writeWelcomed('alice@x.org'); // not a first launch
  deps.fakes.chat.myJid = 'alice@x.org';
  deps.fakes.room.services.set('x.org', 'rooms.x.org');
  deps.fakes.roster.seed(BOB, CAROL);
  before(deps);
  const view = render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  return { deps, core, view };
}

/** A hall and a letter from Bob: both groups have a row. */
function hallAndLetter(deps: FakeDependencies, room: Partial<Room> = {}) {
  deps.fakes.room.change(hall(room));
  deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hi' });
}

function group(name: string) {
  return screen.getByRole('region', { name });
}

afterEach(() => window.localStorage.clear());

describe('The sidebar groups', () => {
  it('shows Halls then Letters, each with its rows', async () => {
    await signedIn(hallAndLetter);
    const halls = await screen.findByRole('region', { name: 'Halls' });
    const letters = group('Messages');
    expect(halls.compareDocumentPosition(letters)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(await within(halls).findByRole('button', { name: /Team/ })).toBeInTheDocument();
    expect(within(letters).getByRole('button', { name: /bob/ })).toBeInTheDocument();
    expect(within(halls).queryByRole('button', { name: /bob/ })).toBeNull();
  });

  it('folds a group, keeps the other one, and remembers it for the next window', async () => {
    const { view } = await signedIn(hallAndLetter);
    await screen.findByRole('button', { name: /Team/ });
    const heading = within(group('Halls')).getByRole('button', { name: 'Halls' });
    expect(heading).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(heading);
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Team/ })).toBeNull();
    expect(within(group('Messages')).getByRole('button', { name: /bob/ })).toBeInTheDocument();

    view.unmount();
    await signedIn(hallAndLetter);
    await screen.findByRole('button', { name: /bob/ });
    expect(within(group('Halls')).getByRole('button', { name: 'Halls' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: /Team/ })).toBeNull();
  });

  it('marks a private hall with a lock, and a silent one at half ink with a bell-off', async () => {
    await signedIn((deps) => hallAndLetter(deps, { visibility: 'private', notify: 'none' }));
    const row = await screen.findByRole('button', { name: /Team/ });
    expect(row).toHaveAccessibleName(/Private/);
    expect(row).toHaveAccessibleName(/Bell off/);
    expect(row).toHaveClass('opacity-50');
    const bob = screen.getByRole('button', { name: /bob/ });
    expect(bob).not.toHaveAccessibleName(/Private|Bell off/);
    expect(bob).not.toHaveClass('opacity-50');
  });

  it('moves with the arrows from the last hall to the first letter and back', async () => {
    await signedIn(hallAndLetter);
    const team = await screen.findByRole('button', { name: /Team/ });
    const bob = screen.getByRole('button', { name: /bob/ });
    team.focus();
    fireEvent.keyDown(team, { key: 'ArrowDown' });
    expect(bob).toHaveFocus();
    fireEvent.keyDown(bob, { key: 'ArrowUp' });
    expect(team).toHaveFocus();
  });

  it('opens a small menu from the "+" of the Halls heading', async () => {
    await signedIn(hallAndLetter);
    fireEvent.click(await screen.findByRole('button', { name: 'Halls: create or join' }));
    const menu = screen.getByRole('menu', { name: 'Halls: create or join' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Create a hall', 'Join a hall']);
    expect(items[0]).toHaveFocus();
    fireEvent.click(items[1] as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Join a hall' })).toBeInTheDocument();
  });

  it('keeps the empty state when there is no chat, no hall and no invitation', async () => {
    await signedIn();
    expect(screen.getByText('No letter yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Halls' })).toBeNull();
  });
});

function openCreate() {
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Create a hall' }));
  return screen.getByRole('dialog', { name: 'Create a hall' });
}

describe('Create a hall', () => {
  it('derives the address from the name until the address is edited, and shows the service', async () => {
    await signedIn();
    const dialog = openCreate();
    const name = within(dialog).getByLabelText('Name');
    expect(name).toHaveFocus();
    const address = within(dialog).getByLabelText('Address');
    fireEvent.change(name, { target: { value: 'Release notes' } });
    expect(address).toHaveValue('release-notes');
    expect(await within(dialog).findByText('@rooms.x.org')).toBeInTheDocument();
    fireEvent.change(address, { target: { value: 'notes' } });
    fireEvent.change(name, { target: { value: 'Release notes 2' } });
    expect(address).toHaveValue('notes');
    expect(within(dialog).getByRole('radio', { name: /Private/ })).toBeChecked();
  });

  it('says Postie’s sentence on a taken address and keeps the dialog', async () => {
    const { deps } = await signedIn((d) =>
      d.fakes.roomAdmin.taken.add('release-notes@rooms.x.org'),
    );
    const dialog = openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Release notes' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A hall already lives at that address.',
    );
    expect(within(dialog).getByLabelText('Address')).toHaveAttribute('aria-invalid', 'true');
    expect(deps.fakes.roomAdmin.settingsByRoom.size).toBe(0);
  });

  it('creates the hall, opens it, then opens the invite dialog on it', async () => {
    const { deps } = await signedIn();
    const dialog = openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Release notes' },
    });
    fireEvent.change(within(dialog).getByLabelText('Description (optional)'), {
      target: { value: 'What ships, when' },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Public/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(
      await screen.findByRole('dialog', { name: 'Invite people to Release notes' }),
    ).toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
    expect(deps.fakes.roomAdmin.settingsByRoom.get('release-notes@rooms.x.org')).toEqual({
      name: 'Release notes',
      description: 'What ships, when',
      visibility: 'public',
    });
    expect(screen.getByRole('heading', { name: 'Release notes', level: 2 })).toBeInTheDocument();
  });

  it('starts the new hall with its intro, its description and "Invite people"', async () => {
    await signedIn();
    const dialog = openCreate();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Crew' } });
    fireEvent.change(within(dialog).getByLabelText('Description (optional)'), {
      target: { value: 'The night shift' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    const invite = await screen.findByRole('dialog', { name: 'Invite people to Crew' });
    fireEvent.click(within(invite).getByRole('button', { name: 'Cancel' }));
    const log = await screen.findByRole('log');
    expect(await within(log).findByText('This is the beginning of Crew')).toBeInTheDocument();
    expect(await within(log).findByText('The night shift')).toBeInTheDocument();
    fireEvent.click(within(log).getByRole('button', { name: 'Invite people' }));
    expect(screen.getByRole('dialog', { name: 'Invite people to Crew' })).toBeInTheDocument();
  });
});

describe('Invite people', () => {
  /** In the hall Team, with Bob already there; the invite dialog open from the pane. */
  async function inviteDialog() {
    const setup = await signedIn((deps) => {
      deps.fakes.room.change(hall({ affiliation: 'owner' }));
      deps.fakes.room.setMembers(TEAM, [
        { nick: 'alice', role: 'moderator', affiliation: 'owner' },
        { nick: 'bob', jid: 'bob@x.org', role: 'participant', affiliation: 'member' },
      ]);
    });
    fireEvent.click(await screen.findByRole('button', { name: /Team/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));
    const dialog = screen.getByRole('dialog', { name: 'Invite people to Team' });
    await within(dialog).findByRole('region', { name: 'Already in this hall' });
    return { ...setup, dialog };
  }

  it('lists the address book, with who is already in the hall apart', async () => {
    const { dialog } = await inviteDialog();
    const results = within(dialog).getByRole('list', { name: 'People found' });
    expect(within(results).getByText('Carol')).toBeInTheDocument();
    expect(within(results).queryByText('Bob')).toBeNull();
    const already = within(dialog).getByRole('region', { name: 'Already in this hall' });
    expect(within(already).getByText('Bob')).toBeInTheDocument();
    expect(within(already).queryByRole('button')).toBeNull();
  });

  it('sends the chosen people, a contact and a pasted address, as chips first', async () => {
    const { deps, dialog } = await inviteDialog();
    const field = within(dialog).getByLabelText('Name or address');
    expect(within(dialog).getByRole('button', { name: 'Invite' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'car' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Carol' }));
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: 'dan@y.org' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.change(field, { target: { value: 'eve@y.org' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    const chips = within(dialog).getByRole('list', { name: 'People to invite' });
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual(['CCarol', 'Ddan@y.org', 'Eeve@y.org']);
    fireEvent.click(within(chips).getByRole('button', { name: 'Remove eve@y.org' }));
    expect(within(chips).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Invite' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(deps.fakes.roomAdmin.invited).toEqual([
      { jid: TEAM, inviteeJid: 'carol@x.org' },
      { jid: TEAM, inviteeJid: 'dan@y.org' },
    ]);
  });

  it('keeps the dialog with Postie’s sentence when the server refuses', async () => {
    const { deps, dialog } = await inviteDialog();
    const { DomainError } = await import('@hey-postie/core');
    deps.fakes.roomAdmin.refuse = new DomainError('NotAllowed');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Carol' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Invite' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('I can’t do that');
    expect(within(dialog).getByRole('button', { name: 'Invite' })).toBeEnabled();
  });
});

describe('Invitations received', () => {
  async function invited() {
    const setup = await signedIn();
    await act(async () => {
      setup.deps.fakes.invitations.arrive({
        roomJid: TEAM,
        fromJid: 'bob@x.org/laptop',
        reason: 'Come <b>in</b>, we are planning',
      });
      await tick();
    });
    const heading = await screen.findByRole('button', { name: /Invitations/ });
    return { ...setup, heading };
  }

  it('shows the group with its count, and the invitation in place of a chat', async () => {
    await invited();
    const invitations = group('Invitations');
    expect(within(invitations).getByRole('button', { name: /Invitations/ })).toHaveTextContent('1');
    const row = within(invitations).getByRole('button', { name: /team/ });
    expect(row).toHaveTextContent('From Bob');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-current', 'true');
    const card = screen.getByRole('region', { name: 'team' });
    expect(within(card).getByText(TEAM)).toBeInTheDocument();
    expect(within(card).getByText('Bob invites you to this hall.')).toBeInTheDocument();
    // Their reason, as text: no markup becomes an element.
    expect(within(card).getByText('Come <b>in</b>, we are planning')).toBeInTheDocument();
    expect(card.querySelector('b')).toBeNull();
  });

  it('joins on "Join": the hall opens, the invitation goes', async () => {
    const { deps } = await invited();
    fireEvent.click(screen.getByRole('button', { name: /team/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    // The conversation (its letters' log) takes the place of the invitation card.
    expect(await screen.findByRole('log')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'team', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull();
    expect(deps.fakes.room.joined).toEqual([TEAM]);
    expect(screen.queryByRole('region', { name: /Invitations/ })).toBeNull();
    expect(within(group('Halls')).getByRole('button', { name: /team/ })).toBeInTheDocument();
  });

  it('declines on "Decline": the inviter is told and the invitation goes', async () => {
    const { deps } = await invited();
    fireEvent.click(screen.getByRole('button', { name: /team/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'team' })).toBeNull());
    expect(deps.fakes.invitations.declined.map((i) => i.roomJid)).toEqual([TEAM]);
    expect(screen.queryByRole('region', { name: /Invitations/ })).toBeNull();
    expect(deps.fakes.room.joined).toEqual([]);
    expect(screen.getByText('Pick a chat')).toBeInTheDocument();
  });
});

describe('A hall destroyed', () => {
  it('leaves the list, and its conversation closes', async () => {
    const { core } = await signedIn((deps) => hallAndLetter(deps, { affiliation: 'owner' }));
    fireEvent.click(await screen.findByRole('button', { name: /Team/ }));
    expect(screen.getByRole('heading', { name: 'Team', level: 2 })).toBeInTheDocument();
    await act(() => core.rooms.destroy(TEAM));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Team/ })).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Team', level: 2 })).toBeNull();
    expect(screen.getByText('Pick a chat')).toBeInTheDocument();
  });
});
