import type { FakeDependencies } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { MessageList } from '../components/MessageList';
import { message, renderWithCore, setupCore } from '../test-utils';

const BOB = 'bob@x.org';
const HALL = 'hall@rooms.x.org';
const FINGERPRINT = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const FORMATTED = 'ABCDEF01 23456789 ABCDEF01 23456789 ABCDEF01 23456789 ABCDEF01 23456789';

async function signedIn(before: (deps: FakeDependencies) => void = () => {}) {
  const { deps, core } = setupCore();
  before(deps);
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  return { deps, core };
}

/** A direct chat with Bob, open on screen. */
async function withBob(deps: FakeDependencies, body = 'hello', encryption?: 'undecryptable') {
  act(() => {
    deps.fakes.chat.receive({ chatId: BOB, fromJid: BOB, body, ...(encryption && { encryption }) });
  });
  fireEvent.click(await screen.findByRole('button', { name: /bob/ }));
  return screen.getByRole('region', { name: 'bob' });
}

function sealToggle() {
  return screen.getByRole('button', { name: 'Seal letters' });
}

describe('The lock in the header', () => {
  it('seals the chat, says so in the composer, and follows chat.updated', async () => {
    const { deps, core } = await signedIn((d) =>
      d.fakes.crypto.seed(BOB, { deviceId: 1, fingerprint: FINGERPRINT }),
    );
    await withBob(deps);
    expect(sealToggle()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByPlaceholderText('Write a letter…')).toBeInTheDocument();

    fireEvent.click(sealToggle());
    await waitFor(() => expect(sealToggle()).toHaveAttribute('aria-pressed', 'true'));
    expect(deps.fakes.crypto.encryption.get(BOB)).toBe(true);
    expect(screen.getByPlaceholderText('Write a sealed letter…')).toBeInTheDocument();

    const [chat] = await core.chats.list();
    if (!chat) throw new Error('no chat');
    act(() => core.events.emit('chat.updated', { ...chat, encrypted: false }));
    expect(sealToggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('tells, in Postie’s words, when the other side has no key', async () => {
    const { deps } = await signedIn();
    await withBob(deps);
    fireEvent.click(sealToggle());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'I cannot seal this letter: no key on the other side.',
    );
    expect(sealToggle()).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('The Encryption section of the details pane', () => {
  it('lists the devices with their fingerprint and stamp, and changes the trust', async () => {
    const { deps } = await signedIn((d) =>
      d.fakes.crypto.seed(BOB, { deviceId: 7, fingerprint: FINGERPRINT }),
    );
    await withBob(deps);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const section = screen.getByRole('region', { name: 'Encryption' });
    const list = await within(section).findByRole('list', { name: 'Encryption' });
    expect(within(list).getByText(FORMATTED)).toBeInTheDocument();
    expect(within(list).getByText('Untrusted')).toBeInTheDocument();
    expect(within(section).getByText(/Compare the fingerprints/)).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('button', { name: `Verify ${FORMATTED}` }));
    expect(await within(list).findByText('Verified')).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /^Verify/ })).not.toBeInTheDocument();

    fireEvent.click(within(list).getByRole('button', { name: `Block ${FORMATTED}` }));
    expect(await within(list).findByText('Blocked')).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('button', { name: `Unblock ${FORMATTED}` }));
    expect(await within(list).findByText('Untrusted')).toBeInTheDocument();
    const [device] = await deps.fakes.crypto.devices(BOB);
    expect(device?.trust).toBe('untrusted');
  });

  it('says when the other side has no key yet', async () => {
    const { deps } = await signedIn();
    await withBob(deps);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const section = screen.getByRole('region', { name: 'Encryption' });
    expect(within(section).getByText('No key on the other side yet.')).toBeInTheDocument();
  });

  it('groups the members’ devices by member in a hall', async () => {
    const { deps, core } = await signedIn((d) =>
      d.fakes.crypto.seed(BOB, { deviceId: 2, fingerprint: FINGERPRINT, trust: 'verified' }),
    );
    await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
    act(() => {
      deps.fakes.room.setMembers(HALL, [
        { nick: 'bob', jid: BOB, role: 'moderator', affiliation: 'owner' },
        { nick: 'ghost', role: 'visitor', affiliation: 'none' },
      ]);
    });
    fireEvent.click(await screen.findByRole('button', { name: /hall/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    const section = screen.getByRole('region', { name: 'Encryption' });
    const list = await within(section).findByRole('list', { name: 'bob' });
    expect(within(list).getByText(FORMATTED)).toBeInTheDocument();
    expect(within(list).getByText('Verified')).toBeInTheDocument();
    expect(within(section).queryByRole('list', { name: 'ghost' })).not.toBeInTheDocument();
  });
});

describe('My devices', () => {
  it('lists my keys and removes one after confirmation', async () => {
    const other = FINGERPRINT.replace(/a/g, 'f');
    const { deps } = await signedIn((d) => {
      d.fakes.crypto.seed(
        d.fakes.crypto.ownJid,
        { deviceId: 1, fingerprint: FINGERPRINT },
        { deviceId: 2, fingerprint: other },
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'My devices' }));
    const dialog = screen.getByRole('dialog', { name: 'My devices' });
    const list = await within(dialog).findByRole('list', { name: 'My devices' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText(FORMATTED)).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('button', { name: `Remove ${FORMATTED}` }));
    expect(within(dialog).getByText(/Remove this device\?/)).toBeInTheDocument();
    expect((await deps.fakes.crypto.ownDevices()).length).toBe(2);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(within(dialog).getAllByRole('listitem')).toHaveLength(1));
    expect((await deps.fakes.crypto.ownDevices()).map((d) => d.deviceId)).toEqual([2]);
    expect(within(dialog).queryByText(FORMATTED)).not.toBeInTheDocument();
  });
});

describe('Sealed letters', () => {
  it('shows a wax seal on an outgoing encrypted bubble', () => {
    const { core } = setupCore();
    renderWithCore(
      <MessageList
        messages={[message({ direction: 'out', encryption: 'omemo', body: 'secret' })]}
        hasOlder={false}
        onLoadOlder={async () => false}
        onRetry={() => {}}
        onOpenLink={() => {}}
      />,
      core,
    );
    expect(screen.getByTitle('Sealed')).toBeInTheDocument();
  });

  it('explains an undecryptable letter and leads to the sender’s devices', async () => {
    const { deps } = await signedIn((d) =>
      d.fakes.crypto.seed(BOB, { deviceId: 3, fingerprint: FINGERPRINT }),
    );
    const region = await withBob(deps, '', 'undecryptable');
    expect(await within(region).findByText(/sealed for another device/)).toBeInTheDocument();
    expect(within(region).getByText(/Ask them to send it again/)).toBeInTheDocument();

    fireEvent.click(within(region).getByRole('button', { name: 'Check their devices' }));
    const section = screen.getByRole('region', { name: 'Encryption' });
    expect(section).toHaveFocus();
    expect(await within(section).findByText(FORMATTED)).toBeInTheDocument();
  });
});
