import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageList } from '../components/MessageList';
import { message, renderWithCore, setupCore } from '../test-utils';
import {
  BOB,
  deferred,
  FINGERPRINT,
  FORMATTED,
  HALL,
  signedIn,
  withChat,
} from './seal-test-helpers';

const seal = () => screen.getByRole('button', { name: 'Seal letters' });

describe('The lock in the header', () => {
  it('seals the chat through the service and says so in the composer', async () => {
    const { deps } = await signedIn((d) =>
      d.fakes.crypto.seed(BOB, { deviceId: 1, fingerprint: FINGERPRINT }),
    );
    await withChat(deps);
    expect(seal()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByPlaceholderText('Write a letter…')).toBeInTheDocument();
    fireEvent.click(seal());
    await waitFor(() => expect(seal()).toHaveAttribute('aria-pressed', 'true'));
    expect(deps.fakes.crypto.encryption.get(BOB)).toBe(true);
    expect(screen.getByPlaceholderText('Write a sealed letter…')).toBeInTheDocument();
  });

  it('waits for the service, takes no second click, and lets chat.updated have the last word', async () => {
    const { deps, core } = await signedIn((d) =>
      d.fakes.crypto.seed(BOB, { deviceId: 1, fingerprint: FINGERPRINT }),
    );
    await withChat(deps);
    const call = deferred<void>();
    const spy = vi.spyOn(deps.fakes.crypto, 'setEncryption').mockReturnValue(call.promise);
    fireEvent.click(seal());
    fireEvent.click(seal());
    await waitFor(() => expect(seal()).toHaveAttribute('aria-busy', 'true'));
    expect(seal()).toBeDisabled();
    expect(seal()).toHaveAttribute('aria-pressed', 'false');
    await act(async () => call.resolve());
    await waitFor(() => expect(seal()).toHaveAttribute('aria-pressed', 'true'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(seal()).not.toHaveAttribute('aria-busy', 'true');

    // The server says otherwise after the call: the record wins over anything local.
    const [chat] = await core.chats.list();
    if (!chat) throw new Error('no chat');
    act(() => core.events.emit('chat.updated', { ...chat, encrypted: false }));
    expect(seal()).toHaveAttribute('aria-pressed', 'false');
  });

  it('tells, in Postie’s words, when the other side has no key', async () => {
    const { deps } = await signedIn();
    await withChat(deps);
    fireEvent.click(seal());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'I cannot seal this letter: no key on the other side.',
    );
    expect(seal()).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('The Encryption section of the details pane', () => {
  it('lists the devices, changes the trust, and keeps the focus on the row', async () => {
    const { deps } = await signedIn((d) =>
      d.fakes.crypto.seed(BOB, { deviceId: 7, fingerprint: FINGERPRINT }),
    );
    await withChat(deps);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const section = screen.getByRole('region', { name: 'Encryption' });
    const list = await within(section).findByRole('list', { name: 'Encryption' });
    const row = within(list).getByRole('listitem');
    expect(within(row).getByText(FORMATTED)).toBeInTheDocument();
    expect(within(row).getByText('Untrusted')).toBeInTheDocument();
    expect(within(section).getByText(/Compare the fingerprints/)).toBeInTheDocument();
    const verify = within(row).getByRole('button', { name: 'Verify' });
    expect(verify).toHaveAccessibleDescription(FORMATTED);

    fireEvent.click(verify);
    expect(await within(row).findByText('Verified')).toBeInTheDocument();
    expect(row).toHaveFocus();
    expect(within(row).queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Block' }));
    expect(await within(row).findByText('Blocked')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Unblock' }));
    expect(await within(row).findByText('Untrusted')).toBeInTheDocument();
    const [device] = await deps.fakes.crypto.devices(BOB);
    expect(device?.trust).toBe('untrusted');
  });

  it('says when the other side has no key yet, but never for a failed load', async () => {
    const { deps } = await signedIn();
    const spy = vi.spyOn(deps.fakes.crypto, 'devices').mockRejectedValueOnce(new Error('offline'));
    await withChat(deps);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const section = screen.getByRole('region', { name: 'Encryption' });
    expect(await within(section).findByRole('alert')).toHaveTextContent(/Something went wrong/);
    expect(within(section).queryByText('No key on the other side yet.')).not.toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'Retry' }));
    expect(await within(section).findByText('No key on the other side yet.')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('shows the devices of the chat on screen, never those of the one before', async () => {
    const { deps } = await signedIn((d) =>
      d.fakes.crypto.seed(BOB, { deviceId: 7, fingerprint: FINGERPRINT }),
    );
    await withChat(deps);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    await screen.findByText(FORMATTED);
    await withChat(deps, 'carol@x.org');
    const section = screen.getByRole('region', { name: 'Encryption' });
    expect(await within(section).findByText('No key on the other side yet.')).toBeInTheDocument();
    expect(screen.queryByText(FORMATTED)).not.toBeInTheDocument();
  });

  it('keeps a devices.changed that arrives while the first load is still out', async () => {
    const { deps } = await signedIn();
    const load = deferred<never[]>();
    vi.spyOn(deps.fakes.crypto, 'devices').mockReturnValueOnce(load.promise);
    await withChat(deps);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    act(() => deps.fakes.crypto.seed(BOB, { deviceId: 9, fingerprint: FINGERPRINT }));
    const section = screen.getByRole('region', { name: 'Encryption' });
    expect(await within(section).findByText(FORMATTED)).toBeInTheDocument();
    await act(async () => load.resolve([]));
    expect(within(section).getByText(FORMATTED)).toBeInTheDocument();
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
        onReact={() => {}}
        onSaveFile={() => {}}
      />,
      core,
    );
    expect(screen.getByTitle('Sealed')).toBeInTheDocument();
  });

  it('explains an undecryptable letter and leads to the sender’s devices, every time', async () => {
    const { deps } = await signedIn((d) =>
      d.fakes.crypto.seed(BOB, { deviceId: 3, fingerprint: FINGERPRINT }),
    );
    const region = await withChat(deps, BOB, '', 'undecryptable');
    expect(await within(region).findByText(/sealed for another device/)).toBeInTheDocument();
    expect(within(region).getByText(/Ask them to send it again/)).toBeInTheDocument();

    const check = within(region).getByRole('button', { name: 'Check their devices' });
    fireEvent.click(check);
    const section = screen.getByRole('region', { name: 'Encryption' });
    expect(section).toHaveFocus();
    expect(await within(section).findByText(FORMATTED)).toBeInTheDocument();

    check.focus();
    fireEvent.click(check);
    expect(section).toHaveFocus();
  });

  it('offers no way to the devices when no pane can open (a hall without a record)', async () => {
    const { deps } = await signedIn();
    act(() => {
      deps.fakes.chat.receive({
        chatId: HALL,
        kind: 'room',
        fromJid: `${HALL}/bob`,
        body: '',
        encryption: 'undecryptable',
      });
    });
    fireEvent.click(await screen.findByRole('button', { name: /hall/ }));
    expect(await screen.findByText(/sealed for another device/)).toBeInTheDocument();
    expect(screen.getByText(/Ask them to send it again/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check their devices' })).not.toBeInTheDocument();
  });
});
