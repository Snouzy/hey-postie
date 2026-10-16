import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { writeWelcomed } from '../core/settings';
import { message, setupCore } from '../test-utils';
import { switcherRows } from './QuickSwitcher';

const BOB = { jid: 'bob@x.org', name: 'Bob', presence: 'online', subscription: 'both' } as const;
const ANN = { jid: 'ann@x.org', name: 'Ann', presence: 'away', subscription: 'both' } as const;

describe('switcherRows', () => {
  it('puts unread chats first, then the others, then contacts without a chat', () => {
    const chats = [
      {
        id: 'bob@x.org',
        kind: 'direct',
        peerJid: 'bob@x.org',
        title: 'Bob',
        unreadCount: 0,
        encrypted: false,
      },
      {
        id: 'team@r.x.org',
        kind: 'room',
        peerJid: 'team@r.x.org',
        title: 'Team',
        unreadCount: 2,
        encrypted: false,
      },
    ] as const;
    const rows = switcherRows('', [...chats], [BOB, ANN]);
    expect(rows.map((r) => (r.kind === 'chat' ? r.chat.title : r.contact.name))).toEqual([
      'Team',
      'Bob',
      'Ann',
    ]);
    expect(switcherRows('an', [...chats], [BOB, ANN]).map((r) => r.kind)).toEqual(['contact']);
  });
});

describe('Cmd/Ctrl+K', () => {
  async function signedIn() {
    const { deps, core } = setupCore();
    writeWelcomed('alice@x.org');
    deps.fakes.roster.seed(BOB, ANN);
    deps.fakes.chat.history('bob@x.org', [message({ chatId: 'bob@x.org', fromJid: 'bob@x.org' })]);
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hi' });
    render(<App core={core} locale="en" />);
    await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
    await screen.findByRole('button', { name: /^bob/ });
    return { deps, core };
  }

  it('opens “Go to…”, filters as I type, and Enter opens the chat', async () => {
    await signedIn();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const dialog = screen.getByRole('dialog', { name: 'Go to…' });
    const field = within(dialog).getByRole('combobox', { name: 'Chat, hall or contact' });
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: 'bo' } });
    expect(within(dialog).getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'bob' })).toBeInTheDocument();
  });

  it('opens a contact without a chat yet, and Cmd/Ctrl+N starts a new letter', async () => {
    await signedIn();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const field = screen.getByRole('combobox', { name: 'Chat, hall or contact' });
    fireEvent.change(field, { target: { value: 'ann' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await screen.findByRole('heading', { name: /^ann/i })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(screen.getByRole('dialog', { name: 'New chat' })).toBeInTheDocument();
  });
});
