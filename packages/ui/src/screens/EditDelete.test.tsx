import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { setupCore } from '../test-utils';

const BOB = { jid: 'bob@x.org', name: 'Bob', presence: 'online', subscription: 'both' } as const;

/** Signed in, Bob's chat open, with one letter from Bob and one of mine. */
async function inBobsChat() {
  const { deps, core } = setupCore();
  deps.fakes.roster.seed(BOB);
  deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'Lunch?' });
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  fireEvent.click(await screen.findByRole('button', { name: /bob/i }));
  await act(() => core.chats.send('bob@x.org', 'Helo'));
  return { deps, core };
}

/** The bubble holding this text (the chat list shows it too, as the preview). */
function bubble(text: string): HTMLElement {
  const element = screen
    .getAllByText(text)
    .map((match) => match.closest('[data-message-id]'))
    .find((match) => match instanceof HTMLElement);
  if (!(element instanceof HTMLElement)) throw new Error(`no bubble for ${text}`);
  return element;
}

function pick(text: string, action: string) {
  fireEvent.click(within(bubble(text)).getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: action }));
}

describe('editing and deleting letters', () => {
  it('corrects my letter from the composer', async () => {
    const { deps } = await inBobsChat();
    pick('Helo', 'Edit');
    const area = screen.getByRole('textbox', { name: /Write a letter/ });
    expect(area).toHaveValue('Helo');
    fireEvent.change(area, { target: { value: 'Hello' } });
    await act(async () => fireEvent.keyDown(area, { key: 'Enter' }));
    await waitFor(() => expect(bubble('Hello')).toBeInTheDocument());
    expect(within(bubble('Hello')).getByText('edited')).toBeInTheDocument();
    // A correction, not a second letter.
    expect(deps.fakes.chat.sent.map((m) => m.body)).toEqual(['Helo']);
  });

  it('deletes my letter for everyone after the confirmation', async () => {
    const { deps } = await inBobsChat();
    pick('Helo', 'Delete for everyone…');
    const dialog = screen.getByRole('dialog', { name: 'Delete for everyone?' });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' })));
    expect(await screen.findByText('This letter was deleted.')).toBeInTheDocument();
    expect(deps.fakes.chat.retracted).toHaveLength(1);
  });

  it('hides Bob’s letter for me only', async () => {
    const { deps } = await inBobsChat();
    pick('Lunch?', 'Delete for me');
    await waitFor(() => expect(screen.queryByText('Lunch?', { selector: 'p, p *' })).toBeNull());
    expect(deps.fakes.chat.retracted).toHaveLength(0);
  });
});
