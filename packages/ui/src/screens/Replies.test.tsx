import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { setupCore } from '../test-utils';

const BOB = { jid: 'bob@x.org', name: 'Bob', presence: 'online', subscription: 'both' } as const;
const CAROL = {
  jid: 'carol@x.org',
  name: 'Carol',
  presence: 'online',
  subscription: 'both',
} as const;

/** Signed in, Bob's chat open, with one letter from Bob and one of mine; Carol wrote too. */
async function inBobsChat() {
  const { deps, core } = setupCore();
  deps.fakes.roster.seed(BOB);
  deps.fakes.roster.seed(CAROL);
  deps.fakes.chat.receive({ chatId: 'carol@x.org', fromJid: 'carol@x.org', body: 'Hey' });
  const lunch = deps.fakes.chat.receive({
    chatId: 'bob@x.org',
    fromJid: 'bob@x.org',
    body: 'Lunch?',
  });
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  fireEvent.click(await screen.findByRole('button', { name: /bob/i }));
  await screen.findByText('Lunch?', { selector: 'p, p *' });
  return { deps, core, lunch };
}

function bubble(text: string): HTMLElement {
  const element = screen
    .getAllByText(text)
    .map((match) => match.closest('[data-message-id]'))
    .find((match) => match instanceof HTMLElement);
  if (!(element instanceof HTMLElement)) throw new Error(`no bubble for ${text}`);
  return element;
}

const composer = () => screen.getByRole('textbox', { name: /Write a letter/ });

describe('quote-replies', () => {
  it('answers Bob’s letter from its toolbar: banner, reply sent, quote that leads back', async () => {
    const { deps, lunch } = await inBobsChat();
    fireEvent.click(within(bubble('Lunch?')).getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to Bob')).toBeInTheDocument();
    expect(composer()).toHaveFocus();

    fireEvent.change(composer(), { target: { value: 'Yes' } });
    await act(async () => fireEvent.keyDown(composer(), { key: 'Enter' }));
    expect(deps.fakes.chat.sent.at(-1)?.replyTo?.id).toBe(lunch.id);
    expect(screen.queryByText('Replying to Bob')).toBeNull();

    const quote = await within(bubble('Yes')).findByRole('button', {
      name: 'In reply to Bob Lunch?',
    });
    expect(quote).toHaveTextContent('Lunch?');
    fireEvent.click(quote);
    await waitFor(() => expect(bubble('Lunch?')).toHaveFocus());
    expect(bubble('Lunch?').className).toContain('ring-yellow');
  });

  it('answers from the ⋯ menu too, and Esc or the X cancel without touching the draft', async () => {
    await inBobsChat();
    fireEvent.click(within(bubble('Lunch?')).getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reply' }));
    fireEvent.change(composer(), { target: { value: 'draft' } });
    fireEvent.keyDown(composer(), { key: 'Escape' });
    expect(screen.queryByText('Replying to Bob')).toBeNull();
    expect(composer()).toHaveValue('draft');

    fireEvent.click(within(bubble('Lunch?')).getByRole('button', { name: 'Reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the reply' }));
    expect(screen.queryByText('Replying to Bob')).toBeNull();
  });

  it('keeps the reply with the draft when I go to another chat and back', async () => {
    await inBobsChat();
    fireEvent.click(within(bubble('Lunch?')).getByRole('button', { name: 'Reply' }));
    fireEvent.change(composer(), { target: { value: 'Sure' } });
    fireEvent.click(screen.getByRole('button', { name: /carol/i }));
    await screen.findByText('Hey', { selector: 'p, p *' });
    expect(screen.queryByText('Replying to Bob')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /bob/i }));
    expect(await screen.findByText('Replying to Bob')).toBeInTheDocument();
    expect(composer()).toHaveValue('Sure');
  });

  it('calls my own letter mine', async () => {
    const { core } = await inBobsChat();
    await act(() => core.chats.send('bob@x.org', 'Helo'));
    fireEvent.click(within(bubble('Helo')).getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to your own letter')).toBeInTheDocument();
  });
});

describe('the “New” line', () => {
  it('sits above the first letter that was unread when the chat opened, until I leave', async () => {
    const { deps, core } = setupCore();
    deps.fakes.roster.seed(BOB);
    deps.fakes.roster.seed(CAROL);
    deps.fakes.chat.receive({ chatId: 'carol@x.org', fromJid: 'carol@x.org', body: 'Hey' });
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'old one' });
    await core.chats.markRead('bob@x.org');
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'new one' });
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'newer' });
    render(<App core={core} locale="en" />);
    await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
    fireEvent.click(await screen.findByRole('button', { name: /bob/i }));
    await screen.findByText('newer', { selector: 'p, p *' });

    const line = screen.getByRole('separator', { name: 'New letters start here' });
    const follows = (node: Node) => line.compareDocumentPosition(node);
    expect(follows(bubble('new one')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(follows(bubble('old one')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    // Opening the chat read it: the line stays all the same.
    await waitFor(() => expect(deps.fakes.chat.markedRead).toContain('bob@x.org'));
    expect(screen.getByRole('separator', { name: 'New letters start here' })).toBe(line);

    fireEvent.click(screen.getByRole('button', { name: /carol/i }));
    await screen.findByText('Hey', { selector: 'p, p *' });
    fireEvent.click(screen.getByRole('button', { name: /bob/i }));
    await screen.findByText('newer', { selector: 'p, p *' });
    expect(screen.queryByRole('separator', { name: 'New letters start here' })).toBeNull();
  });
});
