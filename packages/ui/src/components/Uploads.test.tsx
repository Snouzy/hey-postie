import { DomainError } from '@hey-postie/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setupCore } from '../test-utils';
import { attach } from './parcel-test-helpers';

/** Signed in, with two chats in the sidebar, bob open. */
async function twoChats() {
  const { deps, core } = setupCore();
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  act(() => {
    // A contact: a stranger's letter waits in the requests group, not in the chat list.
    deps.fakes.roster.seed({
      jid: 'bob@x.org',
      name: 'bob',
      presence: 'offline',
      subscription: 'both',
    });
    deps.fakes.roster.seed({
      jid: 'carol@x.org',
      name: 'carol',
      presence: 'offline',
      subscription: 'both',
    });
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hi from bob' });
    deps.fakes.chat.receive({
      chatId: 'carol@x.org',
      fromJid: 'carol@x.org',
      body: 'hi from carol',
    });
  });
  fireEvent.click(await screen.findByRole('button', { name: /bob/ }));
  await screen.findByText('hi from bob');
  return { deps, core };
}

describe('Uploads across chats', () => {
  it('keeps a parcel in flight while another chat is open', async () => {
    const { core } = await twoChats();
    vi.spyOn(core.files, 'send').mockReturnValue(new Promise(() => {}));
    attach([new File(['x'], 'slow.bin')]);
    expect(
      await screen.findByRole('progressbar', { name: 'Sending slow.bin' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /carol/ }));
    await screen.findByText('hi from carol');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /bob/ }));
    expect(
      await screen.findByRole('progressbar', { name: 'Sending slow.bin' }),
    ).toBeInTheDocument();
  });

  it('still shows a refusal when coming back to the chat', async () => {
    const { core } = await twoChats();
    vi.spyOn(core.files, 'send').mockRejectedValue(new DomainError('ServerUnreachable'));
    attach([new File(['x'], 'lost.bin')]);
    expect(await screen.findByRole('alert')).toHaveTextContent('I cannot reach this server');
    fireEvent.click(screen.getByRole('button', { name: /carol/ }));
    await screen.findByText('hi from carol');
    fireEvent.click(screen.getByRole('button', { name: /bob/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('I cannot reach this server');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
