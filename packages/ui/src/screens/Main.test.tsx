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
    fireEvent.click(screen.getByRole('button', { name: 'Contacts' }));
    expect(await screen.findByRole('heading', { name: 'Away' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Dan/ }));
    expect(await screen.findByRole('heading', { name: 'dan' })).toBeInTheDocument();
  });

  it('keeps its draft per chat: switching chats shows an empty composer', async () => {
    const { deps } = await signedIn();
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hi' });
      deps.fakes.chat.receive({ chatId: 'carol@x.org', fromJid: 'carol@x.org', body: 'yo' });
    });
    fireEvent.click(await screen.findByRole('button', { name: /bob/ }));
    fireEvent.change(await screen.findByRole('textbox', { name: /Write/ }), {
      target: { value: 'draft for bob' },
    });
    fireEvent.click(screen.getByRole('button', { name: /carol/ }));
    expect(await screen.findByRole('heading', { name: 'carol' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Write/ })).toHaveValue('');
  });

  it('stays on the main window when the line drops and offers to sign in again', async () => {
    const { deps } = await signedIn();
    await act(() => deps.fakes.xmpp.disconnect());
    expect(screen.getByRole('searchbox', { name: 'Search chats' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('I lost the line to the server.');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows the reconnecting banner while the connection comes back', async () => {
    const { deps } = await signedIn();
    act(() => deps.fakes.xmpp.setState('connecting'));
    expect(screen.getByRole('status')).toHaveTextContent('back on the bike');
    expect(screen.getByRole('searchbox', { name: 'Search chats' })).toBeInTheDocument();
    act(() => deps.fakes.xmpp.setState('online'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('opens the chat a chat.requested event asks for, even when it is not listed yet', async () => {
    const { core } = await signedIn();
    act(() => core.events.emit('chat.requested', { chatId: 'erin@x.org' }));
    expect(await screen.findByRole('heading', { name: 'erin' })).toBeInTheDocument();
  });

  it('shows the error sentence in the new chat dialog for a bad address', async () => {
    await signedIn();
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That address does not look right.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('asks before removing a contact and closes the pane once done', async () => {
    const { deps } = await signedIn((deps) =>
      deps.fakes.roster.seed({
        jid: 'bob@x.org',
        name: 'Bob',
        presence: 'online',
        subscription: 'both',
      }),
    );
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hi' });
    });
    fireEvent.click(await screen.findByRole('button', { name: /bob/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove contact' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(await deps.fakes.roster.list()).toEqual([]);
  });

  it('signs out back to the welcome screen', async () => {
    await signedIn();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Create an account' })).toBeInTheDocument();
  });
});
