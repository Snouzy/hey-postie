import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BOB,
  FINGERPRINT,
  FORMATTED,
  HALL,
  OTHER,
  OTHER_FORMATTED,
  signedIn,
} from './seal-test-helpers';

async function openMyDevices() {
  fireEvent.click(screen.getByRole('button', { name: 'alice' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'My devices…' }));
  return screen.getByRole('dialog', { name: 'My devices' });
}

describe('My devices', () => {
  it('lists my keys, marks this device, and removes another with the focus following', async () => {
    const { deps } = await signedIn((d) => {
      d.fakes.crypto.seed(
        d.fakes.crypto.ownJid,
        { deviceId: 1, fingerprint: FINGERPRINT },
        { deviceId: 2, fingerprint: OTHER },
      );
    });
    const dialog = await openMyDevices();
    const list = await within(dialog).findByRole('list', { name: 'My devices' });
    const [mine, other] = within(list).getAllByRole('listitem');
    if (!mine || !other) throw new Error('two rows expected');
    expect(within(mine).getByText(FORMATTED)).toBeInTheDocument();
    // The fake's own device is the first seeded one: marked, and not removable from itself.
    expect(await within(mine).findByText('This device')).toBeInTheDocument();
    expect(within(mine).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    const remove = within(other).getByRole('button', { name: 'Remove' });
    expect(remove).toHaveAccessibleDescription(OTHER_FORMATTED);

    fireEvent.click(remove);
    expect(within(dialog).getByText(/Remove this device\?/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Remove' });
    await waitFor(() => expect(confirm).toHaveFocus());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const back = await within(dialog).findByRole('button', { name: 'Remove' });
    expect(back).toHaveFocus();
    expect((await deps.fakes.crypto.ownDevices()).length).toBe(2);

    fireEvent.click(back);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(within(dialog).getAllByRole('listitem')).toHaveLength(1));
    expect((await deps.fakes.crypto.ownDevices()).map((d) => d.deviceId)).toEqual([1]);
    expect(within(dialog).queryByText(OTHER_FORMATTED)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: 'My devices' }).parentElement).toHaveFocus();
  });

  it('drops the confirmation when the device goes away from elsewhere', async () => {
    const { deps } = await signedIn((d) => {
      d.fakes.crypto.seed(
        d.fakes.crypto.ownJid,
        { deviceId: 1, fingerprint: FINGERPRINT },
        { deviceId: 2, fingerprint: OTHER },
      );
    });
    const dialog = await openMyDevices();
    await within(dialog).findByRole('list', { name: 'My devices' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(within(dialog).getByText(/Remove this device\?/)).toBeInTheDocument();
    await act(() => deps.fakes.crypto.removeOwnDevice(2));
    expect(await within(dialog).findByRole('list', { name: 'My devices' })).toBeInTheDocument();
    expect(within(dialog).queryByText(/Remove this device\?/)).not.toBeInTheDocument();
  });

  it('shows a failed load as a sentence with Retry, never as "no key"', async () => {
    const { deps } = await signedIn((d) => {
      d.fakes.crypto.seed(d.fakes.crypto.ownJid, { deviceId: 1, fingerprint: FINGERPRINT });
    });
    vi.spyOn(deps.fakes.crypto, 'ownDevices').mockRejectedValueOnce(new Error('offline'));
    const dialog = await openMyDevices();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Something went wrong/);
    expect(within(dialog).queryByText('No key on this side yet.')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(await within(dialog).findByText(FORMATTED)).toBeInTheDocument();
  });
});

describe('The Encryption section of a hall', () => {
  async function inHall(
    deps: Awaited<ReturnType<typeof signedIn>>['deps'],
    core: Awaited<ReturnType<typeof signedIn>>['core'],
    members: Parameters<typeof deps.fakes.room.setMembers>[1],
  ) {
    await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
    act(() => deps.fakes.room.setMembers(HALL, members));
    fireEvent.click(await screen.findByRole('button', { name: /hall/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Hall details' }));
    return screen.getByRole('region', { name: 'Encryption' });
  }

  it('groups the members’ devices by member', async () => {
    const { deps, core } = await signedIn((d) =>
      d.fakes.crypto.seed(BOB, { deviceId: 2, fingerprint: FINGERPRINT, trust: 'verified' }),
    );
    const section = await inHall(deps, core, [
      { nick: 'bob', jid: BOB, role: 'moderator', affiliation: 'owner' },
      { nick: 'ghost', role: 'visitor', affiliation: 'none' },
    ]);
    const list = await within(section).findByRole('list', { name: 'bob' });
    expect(within(list).getByText(FORMATTED)).toBeInTheDocument();
    expect(within(list).getByText('Verified')).toBeInTheDocument();
    expect(within(section).queryByRole('list', { name: 'ghost' })).not.toBeInTheDocument();
  });

  it('says nobody has a key when the known members have none, and never shows the hint then', async () => {
    const { deps, core } = await signedIn();
    const section = await inHall(deps, core, [
      { nick: 'bob', jid: BOB, role: 'moderator', affiliation: 'owner' },
    ]);
    expect(
      await within(section).findByText('No key I can check in this hall yet.'),
    ).toBeInTheDocument();
    expect(within(section).queryByText(/Compare the fingerprints/)).not.toBeInTheDocument();
    act(() => deps.fakes.crypto.seed(BOB, { deviceId: 4, fingerprint: FINGERPRINT }));
    expect(await within(section).findByText(FORMATTED)).toBeInTheDocument();
    expect(within(section).getByText(/Compare the fingerprints/)).toBeInTheDocument();
  });
});
