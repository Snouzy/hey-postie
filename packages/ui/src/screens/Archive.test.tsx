import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { message, setupCore } from '../test-utils';

const BOB = { jid: 'bob@x.org', name: 'Bob', presence: 'online', subscription: 'both' } as const;

describe('Show in chat, from the details pane', () => {
  it('loads the older page holding the letter, then brings it into view', async () => {
    const { deps, core } = setupCore();
    deps.fakes.roster.seed(BOB);
    const old = message({
      id: 'old-doc',
      chatId: BOB.jid,
      fromJid: BOB.jid,
      body: 'the plan https://example.org/plan',
    });
    deps.fakes.chat.receive({ chatId: BOB.jid, fromJid: BOB.jid, body: 'Lunch?' });
    // The archive found it further back; the list gets it with its next older page.
    vi.spyOn(core.archive, 'collect').mockResolvedValue({
      items: [{ kind: 'link', message: old, url: 'https://example.org/plan' }],
    });
    const loadOlder = vi.spyOn(core.chats, 'loadOlder').mockResolvedValueOnce([old]);
    render(<App core={core} locale="en" />);
    await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
    fireEvent.click(await screen.findByRole('button', { name: /bob/i }));
    await screen.findByText('Lunch?', { selector: 'p, p *' });
    // The letter is older than the first page: not in the list yet.
    expect(document.querySelector('[data-message-id="old-doc"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Media, links and documents' }));
    fireEvent.click(screen.getByRole('button', { name: 'Links' }));
    await screen.findByRole('link', { name: 'https://example.org/plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Show in chat' }));

    await waitFor(() =>
      expect(document.querySelector('[data-message-id="old-doc"]')).toHaveClass('ring-yellow'),
    );
    expect(loadOlder).toHaveBeenCalledWith(BOB.jid);
  });
});
