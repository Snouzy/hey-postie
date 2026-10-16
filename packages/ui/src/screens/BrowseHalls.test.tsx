import { DomainError, type FakeDependencies } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { writeWelcomed } from '../core/settings';
import { setupCore } from '../test-utils';

const LISTED = [
  { jid: 'crew@rooms.x.org', name: 'Crew', membersCount: 4, description: 'All hands on deck' },
  { jid: 'stamps@rooms.x.org', name: 'Stamps', membersCount: 2, description: 'Collectors' },
  { jid: 'kitchen@rooms.x.org', name: 'Kitchen', description: 'Recipes and stamps of approval' },
];

/** Alice on x.org, whose server lists three halls; she is already in Stamps. */
async function browsing(before: (deps: FakeDependencies) => void = () => {}) {
  const { deps, core } = setupCore();
  writeWelcomed('alice@x.org');
  deps.fakes.chat.myJid = 'alice@x.org';
  deps.fakes.room.services.set('x.org', 'rooms.x.org');
  deps.fakes.room.publish('rooms.x.org', LISTED);
  // A letter from Bob: the sidebar shows its groups, and the Halls heading its "+".
  deps.fakes.roster.seed({
    jid: 'bob@x.org',
    name: 'Bob',
    presence: 'online',
    subscription: 'both',
  });
  deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hi' });
  before(deps);
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  fireEvent.click(await screen.findByRole('button', { name: 'Halls: create or join' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Browse halls' }));
  const dialog = screen.getByRole('dialog', { name: 'Join a hall' });
  const list = await within(dialog).findByRole('list', { name: 'Listed halls' });
  return { deps, core, dialog, list };
}

const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((row) => row.querySelector('.font-semibold')?.textContent);

afterEach(() => window.localStorage.clear());

describe('Browse halls', () => {
  it('reads the directory at once: name, members and description on one line', async () => {
    const { list } = await browsing();
    expect(names(list)).toEqual(['Crew', 'Stamps', 'Kitchen']);
    const crew = within(list).getAllByRole('listitem')[0] as HTMLElement;
    expect(crew).toHaveTextContent('Crew · 4 members · All hands on deck');
    expect(within(crew).getByTitle('Crew · 4 members · All hands on deck')).toBeInTheDocument();
  });

  it('filters by name, address or description', async () => {
    const { dialog, list } = await browsing();
    const search = within(dialog).getByLabelText('Search halls');
    fireEvent.change(search, { target: { value: 'stamp' } });
    expect(names(list)).toEqual(['Stamps', 'Kitchen']);
    fireEvent.change(search, { target: { value: 'crew@' } });
    expect(names(list)).toEqual(['Crew']);
    fireEvent.change(search, { target: { value: 'nothing like it' } });
    expect(within(list).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(dialog).getByText('No listed hall by that name.')).toBeInTheDocument();
  });

  it('joins a hall with the button, with the account’s nick, and opens it', async () => {
    const { deps, dialog, list } = await browsing();
    fireEvent.click(within(list).getByRole('button', { name: 'Join Crew' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(deps.fakes.room.joined).toEqual(['crew@rooms.x.org']);
    expect((await deps.fakes.room.list())[0]?.nick).toBe('alice');
    expect(await screen.findByRole('heading', { name: 'crew' })).toBeInTheDocument();
  });

  it('marks the halls I am in as joined, without a button', async () => {
    const { list } = await browsing((deps) =>
      deps.fakes.room.change({
        jid: 'stamps@rooms.x.org',
        name: 'Stamps',
        nick: 'alice',
        joined: true,
        bookmarked: true,
        notify: 'mentions',
        unreadCount: 0,
        mentionsCount: 0,
      }),
    );
    const stamps = within(list).getAllByRole('listitem')[1] as HTMLElement;
    expect(within(stamps).getByText('Joined')).toBeInTheDocument();
    expect(within(stamps).queryByRole('button')).not.toBeInTheDocument();
  });

  it('says why a join failed and stays open', async () => {
    const { dialog, list } = await browsing((deps) =>
      deps.fakes.room.refusals.set('crew@rooms.x.org', new DomainError('RoomBanned')),
    );
    fireEvent.click(within(list).getByRole('button', { name: 'Join Crew' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('shut its door');
  });

  it('offers to create the hall searched for, and the create dialog starts from its name', async () => {
    const { dialog } = await browsing();
    const search = within(dialog).getByLabelText('Search halls');
    fireEvent.change(search, { target: { value: 'crew' } });
    // A listed hall bears that very name: nothing to create.
    expect(within(dialog).queryByRole('button', { name: /Create the hall/ })).toBeNull();
    fireEvent.change(search, { target: { value: 'Release notes' } });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create the hall “Release notes”' }),
    );
    const create = screen.getByRole('dialog', { name: 'Create a hall' });
    expect(within(create).getByLabelText('Name')).toHaveValue('Release notes');
    expect(within(create).getByLabelText('Address')).toHaveValue('release-notes');
    expect(screen.queryByRole('dialog', { name: 'Join a hall' })).not.toBeInTheDocument();
  });
});
