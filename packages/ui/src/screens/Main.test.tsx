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

describe('Main', () => {
  it('shows Postie asleep while no chat is open', async () => {
    await signedIn();
    expect(screen.getByRole('img', { name: /asleep/ })).toBeInTheDocument();
    expect(screen.getByText(/No letter open/)).toBeInTheDocument();
  });

  it('marks a chat read and tells notifications which chat is open when it is selected', async () => {
    const { deps } = await signedIn();
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hello' });
    });
    fireEvent.click(await screen.findByRole('button', { name: /bob/ }));
    await waitFor(() => expect(deps.fakes.chat.markedRead).toContain('bob@x.org'));
    const conversation = screen.getByRole('region', { name: 'bob' });
    expect(await within(conversation).findByText('hello')).toBeInTheDocument();

    // The first message notified (no chat was open). Now the chat is open and the window
    // focused: a second message must not.
    await waitFor(() => expect(deps.fakes.notifier.shown).toHaveLength(1));
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'again' });
    });
    await within(conversation).findByText('again');
    expect(deps.fakes.notifier.shown).toHaveLength(1);
  });

  it('notifies when the window is blurred', async () => {
    const { deps } = await signedIn();
    fireEvent.blur(window);
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'psst' });
    });
    await waitFor(() => expect(deps.fakes.notifier.shown).toHaveLength(1));
  });

  it('opens a new chat from the dialog', async () => {
    await signedIn();
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    const dialog = screen.getByRole('dialog', { name: 'New chat' });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'Carol@x.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: 'carol' })).toBeInTheDocument();
  });

  it('lists contacts by presence and opens a chat on click', async () => {
    await signedIn((deps) =>
      deps.fakes.roster.seed({
        jid: 'dan@x.org',
        name: 'Dan',
        presence: 'away',
        subscription: 'both',
      }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Contacts' }));
    expect(await screen.findByRole('heading', { name: 'Away' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Dan/ }));
    expect(await screen.findByRole('heading', { name: 'dan' })).toBeInTheDocument();
  });

  it('signs out back to the welcome screen', async () => {
    await signedIn();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Create an account' })).toBeInTheDocument();
  });
});
