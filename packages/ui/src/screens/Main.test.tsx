import type { FakeDependencies } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
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
  beforeEach(() => window.localStorage.clear());

  it('shows Postie waving while no chat is open', async () => {
    await signedIn((deps) =>
      deps.fakes.roster.seed({
        jid: 'bob@x.org',
        name: 'Bob',
        presence: 'online',
        subscription: 'both',
      }),
    );
    expect(screen.getByRole('img', { name: /waving/ })).toBeInTheDocument();
    expect(screen.getByText('Pick a chat')).toBeInTheDocument();
    expect(screen.getByText(/No letter open/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
  });

  it('welcomes a first launch with an empty address book, once per account', async () => {
    const { core } = await signedIn();
    expect(await screen.findByRole('heading', { name: 'Welcome aboard' })).toBeInTheDocument();
    expect(screen.getByText(/Add a contact/)).toBeInTheDocument();
    expect(screen.getByText(/Join a hall/)).toBeInTheDocument();
    expect(screen.getByText(/sealed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('heading', { name: 'Welcome aboard' })).not.toBeInTheDocument();
    expect(screen.getByText('Pick a chat')).toBeInTheDocument();

    // Signed out and back in: the card does not come back for this account.
    fireEvent.click(screen.getByRole('button', { name: 'alice' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await screen.findByRole('button', { name: 'Create an account' });
    await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
    expect(screen.getByText('Pick a chat')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull());
  });

  it('keeps the welcome card for another account', async () => {
    window.localStorage.setItem('hey-postie:welcomed', JSON.stringify(['someone@x.org']));
    await signedIn();
    expect(await screen.findByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('marks a chat read and tells notifications which chat is open when it is selected', async () => {
    const { deps } = await signedIn();
    // Bob is a contact: a stranger's letter never notifies (message requests).
    deps.fakes.roster.seed({
      jid: 'bob@x.org',
      name: 'Bob',
      presence: 'online',
      subscription: 'both',
    });
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
    deps.fakes.roster.seed({
      jid: 'bob@x.org',
      name: 'Bob',
      presence: 'online',
      subscription: 'both',
    });
    fireEvent.blur(window);
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'psst' });
    });
    await waitFor(() => expect(deps.fakes.notifier.shown).toHaveLength(1));
  });

  it('opens a new chat from the dialog', async () => {
    await signedIn();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New chat' }));
    const dialog = screen.getByRole('dialog', { name: 'New chat' });
    const field = screen.getByRole('combobox', { name: 'Name or address' });
    fireEvent.change(field, { target: { value: 'Carol@x.org' } });
    fireEvent.keyDown(field, { key: 'Enter' });
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
    fireEvent.click(screen.getByRole('button', { name: 'Address book' }));
    expect(await screen.findByRole('heading', { name: 'Away' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Dan/ }));
    expect(await screen.findByRole('heading', { name: 'dan' })).toBeInTheDocument();
  });

  it('keeps its draft per chat: switching chats shows an empty composer', async () => {
    const { deps } = await signedIn();
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
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New chat' }));
    const field = screen.getByRole('combobox', { name: 'Name or address' });
    fireEvent.change(field, { target: { value: 'nope' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveTextContent('That address does not look right.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
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
    fireEvent.click(screen.getByRole('button', { name: 'alice' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Create an account' })).toBeInTheDocument();
  });

  it('says who is typing above the composer, and stops once they pause', async () => {
    const { deps } = await signedIn();
    deps.fakes.roster.seed({
      jid: 'bob@x.org',
      name: 'Bob',
      presence: 'online',
      subscription: 'both',
    });
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hello' });
    });
    fireEvent.click(await screen.findByRole('button', { name: /bob/ }));
    await screen.findByRole('region', { name: 'bob' });
    act(() => deps.fakes.chat.receiveChatState('bob@x.org', 'bob@x.org', 'composing'));
    expect(await screen.findByText('bob is typing…')).toBeInTheDocument();
    act(() => deps.fakes.chat.receiveChatState('bob@x.org', 'bob@x.org', 'paused'));
    await waitFor(() => expect(screen.queryByText(/is typing/)).not.toBeInTheDocument());
  });

  it('exposes the conversation column as the main landmark', async () => {
    await signedIn();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).not.toContainElement(screen.getByRole('main'));
  });
});
