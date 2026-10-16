import type { FakeDependencies } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { setupCore } from '../test-utils';

async function signedIn(before: (deps: FakeDependencies) => void = () => {}) {
  const { deps, core } = setupCore();
  before(deps);
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  return { deps, core };
}

const BOB = { jid: 'bob@x.org', name: 'Bob', presence: 'online', subscription: 'both' } as const;

/** Eve asks with a note; Frank wrote before asking; Bob is a contact who wrote too. */
function atTheDoor(deps: FakeDependencies) {
  deps.fakes.roster.seed(BOB);
  deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'from a friend' });
  deps.fakes.chat.receive({ chatId: 'frank@x.org', fromJid: 'frank@x.org', body: 'hello there' });
  deps.fakes.roster.request({ jid: 'eve@x.org', name: 'Eve', message: 'We met at the fair' });
}

async function openRequests() {
  const group = await screen.findByRole('button', { name: /Letters from strangers/ });
  fireEvent.click(group);
  return group;
}

describe('Letters from strangers', () => {
  it('lists pending requests and strangers who wrote, most recent first, with the count', async () => {
    await signedIn(atTheDoor);
    const group = await openRequests();
    expect(group).toHaveTextContent('2');
    expect(group).toHaveAttribute('aria-expanded', 'true');
    const rows = screen.getAllByRole('button', { name: /Eve|frank/ });
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('We met at the fair'),
      expect.stringContaining('hello there'),
    ]);
    expect(rows[0]).toHaveTextContent('Eve');
  });

  it('keeps a stranger out of the chat list and shows a contact there', async () => {
    await signedIn(atTheDoor);
    expect(await screen.findByRole('button', { name: /bob/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /frank/ })).not.toBeInTheDocument();
    await openRequests();
    expect(screen.getByRole('button', { name: /frank/ })).toBeInTheDocument();
  });

  it('shows the request with the note and the letters held, without a composer or a bell', async () => {
    const { deps } = await signedIn(atTheDoor);
    await openRequests();
    fireEvent.click(screen.getByRole('button', { name: /frank/ }));
    const request = await screen.findByRole('region', { name: 'frank' });
    expect(within(request).getByText('frank@x.org')).toBeInTheDocument();
    expect(await within(request).findByText('hello there')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Write/ })).not.toBeInTheDocument();
    // Bob's letter rang the bell; Frank's did not.
    expect(deps.fakes.notifier.shown.map((n) => n.title)).toEqual(['bob']);

    fireEvent.click(screen.getByRole('button', { name: /Eve/ }));
    const eve = await screen.findByRole('region', { name: 'Eve' });
    expect(within(eve).getByText('We met at the fair')).toBeInTheDocument();
    expect(within(eve).getByText(/Accepting adds them/)).toBeInTheDocument();
  });

  it('accepting adds the contact and opens the chat as a normal one', async () => {
    const { deps } = await signedIn(atTheDoor);
    await openRequests();
    fireEvent.click(screen.getByRole('button', { name: /frank/ }));
    await screen.findByRole('region', { name: 'frank' });
    // Frank asked too, meanwhile.
    act(() => deps.fakes.roster.request({ jid: 'frank@x.org', name: 'Frank' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(await screen.findByRole('textbox', { name: /Write/ })).toBeInTheDocument();
    expect((await deps.fakes.roster.list()).map((c) => c.jid)).toContain('frank@x.org');
    expect(await deps.fakes.roster.requests()).toEqual([
      expect.objectContaining({ jid: 'eve@x.org' }),
    ]);
    // The chat now sits among the chats, and the group counts Eve alone.
    const group = screen.getByRole('button', { name: /Letters from strangers/ });
    expect(group).toHaveTextContent('1');
    const chats = screen.getAllByRole('button', { name: /^frank/ });
    expect(chats.some((row) => row.getAttribute('aria-current') === 'true')).toBe(true);
  });

  it('ignoring declines the request and puts it away until they ask again', async () => {
    const { deps } = await signedIn(atTheDoor);
    await openRequests();
    fireEvent.click(screen.getByRole('button', { name: /Eve/ }));
    await screen.findByRole('region', { name: 'Eve' });
    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Eve' })).not.toBeInTheDocument(),
    );
    expect(await deps.fakes.roster.requests()).toEqual([]);
    expect(screen.getByText(/No letter open/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Letters from strangers/ })).toHaveTextContent('1');

    act(() => deps.fakes.roster.request({ jid: 'eve@x.org', name: 'Eve', message: 'Again' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Letters from strangers/ })).toHaveTextContent('2'),
    );
  });

  it('blocking asks first, then the server drops everything they send', async () => {
    const { deps } = await signedIn(atTheDoor);
    await openRequests();
    fireEvent.click(screen.getByRole('button', { name: /Eve/ }));
    await screen.findByRole('region', { name: 'Eve' });
    fireEvent.click(screen.getByRole('button', { name: 'Block…' }));

    const dialog = screen.getByRole('dialog', { name: 'Block' });
    expect(dialog).toHaveTextContent('Block Eve?');
    expect(dialog).toHaveTextContent('drop everything they send');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deps.fakes.roster.blocklist.size).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Block…' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(deps.fakes.roster.blocklist.has('eve@x.org')).toBe(true));
    expect(screen.queryByRole('region', { name: 'Eve' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Letters from strangers/ })).toHaveTextContent('1');

    // Like a server with XEP-0191: a new request from a blocked JID gets nowhere.
    act(() => deps.fakes.roster.request({ jid: 'eve@x.org', name: 'Eve' }));
    expect(screen.getByRole('button', { name: /Letters from strangers/ })).toHaveTextContent('1');
  });

  it('shows the group only when someone is at the door', async () => {
    const { deps } = await signedIn();
    expect(
      screen.queryByRole('button', { name: /Letters from strangers/ }),
    ).not.toBeInTheDocument();
    act(() => deps.fakes.roster.request({ jid: 'eve@x.org', name: 'Eve' }));
    expect(await screen.findByRole('button', { name: /Letters from strangers/ })).toHaveTextContent(
      '1',
    );
  });
});
