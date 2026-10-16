import { DomainError, type FakeDependencies, type Room } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { writeWelcomed } from '../core/settings';
import { setupCore } from '../test-utils';

const TEAM = 'team@rooms.x.org';

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
    affiliation: 'owner',
    visibility: 'private',
    ...overrides,
  };
}

/** Alice in Team with Dave (admin) and Bob (member) present, Carol a member who is away. */
function team(deps: FakeDependencies, room: Partial<Room> = {}) {
  deps.fakes.room.change(hall(room));
  deps.fakes.roomAdmin.settingsByRoom.set(TEAM, {
    name: 'Team',
    description: 'Where the crew meets.',
    visibility: 'private',
  });
  deps.fakes.room.setMembers(TEAM, [
    { nick: 'bob', jid: 'bob@x.org', role: 'participant', affiliation: 'member' },
    {
      nick: 'alice',
      jid: 'alice@x.org',
      role: 'moderator',
      affiliation: room.affiliation ?? 'owner',
    },
    { nick: 'dave', jid: 'dave@x.org', role: 'moderator', affiliation: 'admin' },
  ]);
  deps.fakes.roomAdmin.affiliates.set(TEAM, [
    { jid: 'carol@x.org', nick: 'carol', affiliation: 'member' },
  ]);
}

async function signedIn(before: (deps: FakeDependencies) => void = team) {
  const { deps, core } = setupCore();
  writeWelcomed('alice@x.org');
  deps.fakes.chat.myJid = 'alice@x.org';
  deps.fakes.room.services.set('x.org', 'rooms.x.org');
  before(deps);
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  fireEvent.click(await screen.findByRole('button', { name: /Team/ }));
  return { deps, core, region: screen.getByRole('region', { name: 'Team' }) };
}

async function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Hall details' }));
  return screen.getByRole('complementary', { name: 'Hall details' });
}

async function peopleRows(pane: HTMLElement) {
  const people = within(pane).getByRole('region', { name: 'People' });
  await waitFor(() => expect(within(people).getAllByRole('listitem')).toHaveLength(4));
  return within(people).getAllByRole('listitem');
}

afterEach(() => window.localStorage.clear());

describe('The header of a hall', () => {
  it('edits the topic in place: Enter saves it', async () => {
    const { deps, region } = await signedIn();
    fireEvent.click(within(region).getByRole('button', { name: /change the topic/ }));
    const field = within(region).getByRole('textbox', { name: 'Topic' });
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: '  Release on Friday ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(deps.fakes.roomAdmin.topics.get(TEAM)).toBe('Release on Friday'));
    expect(within(region).queryByRole('textbox', { name: 'Topic' })).not.toBeInTheDocument();
    expect(within(region).getByTitle('Release on Friday')).toBeInTheDocument();
  });

  it('Esc cancels the edit and keeps the pane open', async () => {
    const { deps, region } = await signedIn((d) => team(d, { topic: 'Old news' }));
    await openPanel();
    fireEvent.click(within(region).getByRole('button', { name: /change the topic/ }));
    const field = within(region).getByRole('textbox', { name: 'Topic' });
    fireEvent.change(field, { target: { value: 'Something else' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(within(region).queryByRole('textbox', { name: 'Topic' })).not.toBeInTheDocument();
    expect(within(region).getByTitle('Old news')).toBeInTheDocument();
    expect(deps.fakes.roomAdmin.topics.has(TEAM)).toBe(false);
    expect(screen.getByRole('complementary', { name: 'Hall details' })).toBeInTheDocument();
  });

  it('says it in Postie’s words when the hall refuses the topic', async () => {
    const { deps, region } = await signedIn();
    fireEvent.click(within(region).getByRole('button', { name: /change the topic/ }));
    deps.fakes.roomAdmin.refuse = new DomainError('NotAllowed');
    const field = within(region).getByRole('textbox', { name: 'Topic' });
    fireEvent.change(field, { target: { value: 'Mine now' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await within(region).findByRole('alert')).toHaveTextContent(
      'This hall does not let you do that.',
    );
    expect(field).toBeInTheDocument();
  });

  it('shows the topic as plain text to a member without the right', async () => {
    const { region } = await signedIn((d) => {
      team(d, { affiliation: 'member', topic: 'Read only' });
      d.fakes.room.setMembers(TEAM, [
        { nick: 'alice', jid: 'alice@x.org', role: 'participant', affiliation: 'member' },
      ]);
    });
    await within(region).findByRole('button', { name: 'People in the hall: 1' });
    expect(within(region).getByTitle('Read only').tagName).toBe('P');
  });

  it('opens the panel on its People from the people button, with the count', async () => {
    const { region } = await signedIn();
    fireEvent.click(await within(region).findByRole('button', { name: 'People in the hall: 3' }));
    const pane = screen.getByRole('complementary', { name: 'Hall details' });
    await waitFor(() => expect(within(pane).getByRole('region', { name: 'People' })).toHaveFocus());
  });
});

describe('The hall panel', () => {
  it('shows the hall, its details, and lets its owner edit it', async () => {
    const { deps } = await signedIn();
    const pane = await openPanel();
    expect(await within(pane).findByText('Where the crew meets.')).toBeInTheDocument();
    const details = within(pane).getByRole('region', { name: 'Details' });
    expect(within(details).getByText(TEAM)).toBeInTheDocument();
    expect(within(details).getByText('Private')).toBeInTheDocument();
    expect(await within(details).findByText('4')).toBeInTheDocument();

    const pencil = within(pane).getByRole('button', { name: 'Edit the hall' });
    pencil.focus();
    fireEvent.click(pencil);
    const dialog = screen.getByRole('dialog', { name: 'Edit the hall' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Crew' } });
    fireEvent.change(within(dialog).getByLabelText('Description (optional)'), {
      target: { value: 'All hands.' },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Public/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(deps.fakes.roomAdmin.settingsByRoom.get(TEAM)).toEqual({
      name: 'Crew',
      description: 'All hands.',
      visibility: 'public',
    });
    expect(await within(pane).findByRole('heading', { name: 'Crew' })).toBeInTheDocument();
    expect(within(pane).getByText('All hands.')).toBeInTheDocument();
    expect(pencil).toHaveFocus();
  });

  it('keeps the edit dialog with Postie’s sentence on a refusal', async () => {
    const { deps } = await signedIn();
    const pane = await openPanel();
    await within(pane).findByText('Where the crew meets.');
    fireEvent.click(within(pane).getByRole('button', { name: 'Edit the hall' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit the hall' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Crew' } });
    deps.fakes.roomAdmin.refuse = new DomainError('NotAllowed');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('does not let you');
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('offers no pencil and no delete to someone who is not the owner', async () => {
    await signedIn((d) => team(d, { affiliation: 'admin' }));
    const pane = await openPanel();
    expect(within(pane).queryByRole('button', { name: 'Edit the hall' })).not.toBeInTheDocument();
    expect(
      within(pane).queryByRole('button', { name: 'Delete the hall…' }),
    ).not.toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Leave the hall…' })).toBeInTheDocument();
  });

  it('lists the people present first, owners and admins first, then those away', async () => {
    await signedIn();
    const rows = await peopleRows(await openPanel());
    // Each row: the avatar's initials, the name, "(you)" on mine, the standing.
    expect(rows.map((row) => row.textContent)).toEqual([
      'Aalice(you)owner',
      'Ddaveadmin',
      'Bbobmember',
      'Ccarolmember',
    ]);
    // Present people wear the dot; the one away does not.
    expect(within(rows[2] as HTMLElement).getByRole('img', { name: 'Online' })).toBeInTheDocument();
    expect(within(rows[3] as HTMLElement).queryByRole('img', { name: 'Online' })).toBeNull();
  });

  it('never offers an action on myself, and an owner’s on the others', async () => {
    await signedIn();
    const pane = await openPanel();
    await peopleRows(pane);
    expect(
      within(pane).queryByRole('button', { name: 'Actions for alice' }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(pane).getByRole('button', { name: 'Actions for bob' }));
    const menu = screen.getByRole('menu', { name: 'Actions for bob' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Make admin',
      'Remove from the hall…',
      'Ban…',
    ]);
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    fireEvent.click(within(pane).getByRole('button', { name: 'Actions for dave' }));
    expect(
      within(screen.getByRole('menu'))
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Make member', 'Remove from the hall…', 'Ban…']);
  });

  it('an admin may remove and ban members, never the owner, and makes nobody admin', async () => {
    await signedIn((d) => {
      team(d, { affiliation: 'admin' });
      d.fakes.room.setMembers(TEAM, [
        { nick: 'alice', jid: 'alice@x.org', role: 'moderator', affiliation: 'admin' },
        { nick: 'bob', jid: 'bob@x.org', role: 'participant', affiliation: 'member' },
        { nick: 'olga', jid: 'olga@x.org', role: 'moderator', affiliation: 'owner' },
      ]);
    });
    const pane = await openPanel();
    await peopleRows(pane);
    expect(
      within(pane).queryByRole('button', { name: 'Actions for olga' }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(pane).getByRole('button', { name: 'Actions for bob' }));
    expect(
      within(screen.getByRole('menu'))
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Remove from the hall…', 'Ban…']);
  });

  it('makes someone admin at once', async () => {
    const { deps } = await signedIn();
    const pane = await openPanel();
    await peopleRows(pane);
    fireEvent.click(within(pane).getByRole('button', { name: 'Actions for bob' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make admin' }));
    await waitFor(() =>
      expect(deps.fakes.roomAdmin.affiliates.get(TEAM)).toContainEqual({
        jid: 'bob@x.org',
        affiliation: 'admin',
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removes someone after the confirmation, and Cancel does nothing', async () => {
    const { deps } = await signedIn();
    const pane = await openPanel();
    await peopleRows(pane);
    fireEvent.click(within(pane).getByRole('button', { name: 'Actions for bob' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from the hall…' }));
    let dialog = screen.getByRole('dialog', { name: 'Remove from the hall' });
    expect(dialog).toHaveTextContent('Remove bob from Team?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(deps.fakes.roomAdmin.kicked).toEqual([]);
    expect(within(pane).getByRole('button', { name: 'Actions for bob' })).toHaveFocus();

    fireEvent.click(within(pane).getByRole('button', { name: 'Actions for bob' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from the hall…' }));
    dialog = screen.getByRole('dialog', { name: 'Remove from the hall' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(deps.fakes.roomAdmin.kicked).toEqual([{ jid: TEAM, nick: 'bob' }]);
  });

  it('bans someone away after the confirmation', async () => {
    const { deps } = await signedIn();
    const pane = await openPanel();
    await peopleRows(pane);
    fireEvent.click(within(pane).getByRole('button', { name: 'Actions for carol' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ban…' }));
    const dialog = screen.getByRole('dialog', { name: 'Ban from the hall' });
    expect(dialog).toHaveTextContent('Ban carol from Team?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ban' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(deps.fakes.roomAdmin.affiliates.get(TEAM)).toEqual([
      { jid: 'carol@x.org', affiliation: 'outcast' },
    ]);
    // Re-read after the change: banned, and nothing more to do to her.
    const people = within(pane).getByRole('region', { name: 'People' });
    expect(await within(people).findByText('banned')).toBeInTheDocument();
    expect(within(pane).queryByRole('button', { name: 'Actions for carol' })).toBeNull();
  });

  it('deletes the hall as its owner, with a reason, and the hall leaves the list', async () => {
    const { deps } = await signedIn();
    const pane = await openPanel();
    fireEvent.click(within(pane).getByRole('button', { name: 'Delete the hall…' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete the hall' });
    expect(dialog).toHaveTextContent('cannot be undone');
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'Moved' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deps.fakes.roomAdmin.destroyed).toEqual([TEAM]));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Team/ })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Invite people opens the invite dialog on the hall', async () => {
    await signedIn();
    const pane = await openPanel();
    fireEvent.click(within(pane).getByRole('button', { name: 'Invite people' }));
    expect(screen.getByRole('dialog', { name: 'Invite people to Team' })).toBeInTheDocument();
  });
});
