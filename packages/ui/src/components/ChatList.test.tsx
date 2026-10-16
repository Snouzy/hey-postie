import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChats } from '../core/useChats';
import { renderWithCore, setupCore } from '../test-utils';
import { ChatList } from './ChatList';

/** The list as the sidebar mounts it: data from `useChats`, nothing selected. */
function Harness() {
  const { chats } = useChats();
  return <ChatList chats={chats} selectedId={null} onSelect={() => {}} />;
}

describe('ChatList', () => {
  it('shows the empty state when there is no chat, with Postie and no button', () => {
    const { core } = setupCore();
    renderWithCore(<Harness />, core);
    expect(screen.getByText('No letter yet')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Postie/ })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers to start a chat from the empty state when the sidebar hands the action', () => {
    const { core } = setupCore();
    const onStartChat = vi.fn();
    renderWithCore(
      <ChatList chats={[]} selectedId={null} onSelect={() => {}} onStartChat={onStartChat} />,
      core,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start a chat' }));
    expect(onStartChat).toHaveBeenCalledOnce();
  });

  it('orders chats by last activity and moves a chat up when a message arrives', async () => {
    const { deps, core } = setupCore();
    renderWithCore(<Harness />, core);
    act(() => {
      deps.fakes.chat.receive({ chatId: 'alice@x.org', fromJid: 'alice@x.org', body: 'first' });
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'second' });
    });
    let rows = await screen.findAllByRole('button');
    expect(rows.map((row) => within(row).getByText(/alice|bob/).textContent)).toEqual([
      'bob',
      'alice',
    ]);

    act(() => {
      deps.fakes.chat.receive({ chatId: 'alice@x.org', fromJid: 'alice@x.org', body: 'third' });
    });
    await screen.findByText('third');
    rows = screen.getAllByRole('button');
    expect(within(rows[0] as HTMLElement).getByText('alice')).toBeInTheDocument();
  });

  it('shows the unread badge and clears it on markRead', async () => {
    const { deps, core } = setupCore();
    renderWithCore(<Harness />, core);
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hi' });
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'there' });
    });
    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getByText('unread')).toBeInTheDocument();

    await act(() => core.chats.markRead('bob@x.org'));
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('shows the sealed-letter preview for an undecryptable last message', async () => {
    const { deps, core } = setupCore();
    renderWithCore(<Harness />, core);
    act(() => {
      deps.fakes.chat.receive({
        chatId: 'bob@x.org',
        fromJid: 'bob@x.org',
        body: '',
        encryption: 'undecryptable',
      });
    });
    expect(await screen.findByText('Sealed letter')).toBeInTheDocument();
  });
});
