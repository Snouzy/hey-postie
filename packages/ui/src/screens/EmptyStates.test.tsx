import type { FakeDependencies } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { writeWelcomed } from '../core/settings';
import { setupCore } from '../test-utils';

const HALL = 'hall@rooms.x.org';

/** Signed in, past the first launch: the empty states, not the welcome card. */
async function signedIn(before: (deps: FakeDependencies) => void = () => {}) {
  const { deps, core } = setupCore();
  before(deps);
  writeWelcomed('alice@x.org');
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  return { deps, core };
}

describe('Empty states', () => {
  it('offers to start a chat when the list is empty, and the button opens the dialog', async () => {
    await signedIn();
    expect(screen.getByText('No letter yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start a chat' }));
    expect(screen.getByRole('dialog', { name: 'New chat' })).toBeInTheDocument();
  });

  it('shows no empty state while a stranger waits at the door', async () => {
    const { deps } = await signedIn();
    act(() => {
      deps.fakes.chat.receive({ chatId: 'eve@x.org', fromJid: 'eve@x.org', body: 'hello' });
    });
    await screen.findByRole('button', { name: /Letters from strangers/ });
    expect(screen.queryByText('No letter yet')).not.toBeInTheDocument();
  });

  it('offers to add a contact when the address book is empty', async () => {
    await signedIn();
    expect(screen.getByRole('searchbox', { name: 'Search chats' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Address book' }));
    expect(screen.getByRole('searchbox', { name: 'Search contacts' })).toBeInTheDocument();
    expect(screen.getByText('An empty address book')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /looking around/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add a contact' }));
    expect(screen.getByRole('dialog', { name: 'Add a contact' })).toBeInTheDocument();
  });

  it('shows a blank page, without a button, in a chat with no letter yet', async () => {
    await signedIn();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New chat' }));
    const field = screen.getByRole('combobox', { name: 'Name or address' });
    fireEvent.change(field, { target: { value: 'carol@x.org' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    const log = await screen.findByRole('log');
    expect(await within(log).findByText('A blank page')).toBeInTheDocument();
    expect(within(log).getByRole('img', { name: /pen in hand/ })).toBeInTheDocument();
    expect(within(log).queryByRole('button', { name: /Start|Add/ })).not.toBeInTheDocument();
  });

  it('says no hall is listed when browsing finds nothing', async () => {
    await signedIn((deps) => deps.fakes.room.publish('rooms.x.org', []));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Join a hall' }));
    const dialog = screen.getByRole('dialog', { name: 'Join a hall' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Browse' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Look up' }));
    expect(await within(dialog).findByText('No hall here')).toBeInTheDocument();
    expect(within(dialog).getByText('No hall listed on this server.')).toBeInTheDocument();
  });

  it('shows nothing to show, and still closes, when the pane is open on a hall without a record', async () => {
    const { deps } = await signedIn();
    // A contact: a stranger's letter waits in the requests group, not in the chat list.
    deps.fakes.roster.seed({
      jid: 'bob@x.org',
      name: 'Bob',
      presence: 'online',
      subscription: 'both',
    });
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hi' });
      deps.fakes.chat.receive({ chatId: HALL, kind: 'room', fromJid: `${HALL}/bob`, body: 'old' });
    });
    fireEvent.click(await screen.findByRole('button', { name: /bob/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /hall/ }));
    const pane = await screen.findByRole('complementary');
    expect(within(pane).getByText('Nothing to show')).toBeInTheDocument();
    fireEvent.click(within(pane).getByRole('button', { name: 'Close details' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
  });
});
