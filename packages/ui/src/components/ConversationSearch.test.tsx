import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { message, setupCore } from '../test-utils';
import { CHAT, renderConversation } from './parcel-test-helpers';

/** Bob's chat with three letters, two of them about lunch; the newest last. */
function lunchChat() {
  const setup = setupCore();
  const { chat } = setup.deps.fakes;
  const first = chat.receive({ chatId: CHAT.id, fromJid: CHAT.peerJid, body: 'Lunch at noon?' });
  chat.receive({ chatId: CHAT.id, fromJid: CHAT.peerJid, body: 'Or a walk' });
  const last = chat.receive({
    chatId: CHAT.id,
    fromJid: CHAT.peerJid,
    body: 'Still on for lunch?',
  });
  const rendered = renderConversation(setup);
  return { ...rendered, first, last };
}

function bubbleOf(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
  if (!element) throw new Error(`no letter ${id}`);
  return element;
}

const field = () => screen.getByRole('searchbox', { name: 'Search in this conversation' });
/** The bar: a `<search>` element, which jsdom does not give its role yet. */
function bar(): HTMLElement {
  const element = field().closest<HTMLElement>('search');
  if (!element) throw new Error('no search bar');
  return element;
}

async function openAndType(query: string) {
  await screen.findByText('Or a walk', { selector: 'p, p *' });
  fireEvent.keyDown(window, { key: 'f', metaKey: true });
  fireEvent.change(field(), { target: { value: query } });
}

describe('Searching a conversation', () => {
  it('opens on Cmd+F with the focus in the field, and counts the hits newest first', async () => {
    const { last } = lunchChat();
    await openAndType('LUNCH');
    expect(field()).toHaveFocus();
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    // The newest hit is shown in the list, and its matched word highlighted under the bar.
    await waitFor(() => expect(bubbleOf(last.id)).toHaveClass('ring-yellow'));
    expect(within(bar()).getByText('lunch', { selector: 'mark' })).toBeInTheDocument();
  });

  it('walks the hits with Enter and arrows, and stays at the ends', async () => {
    const { first, last } = lunchChat();
    await openAndType('lunch');
    await screen.findByText('1 of 2');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    await waitFor(() => expect(bubbleOf(first.id)).toHaveClass('ring-yellow'));
    expect(field()).toHaveFocus();
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    await waitFor(() => expect(bubbleOf(last.id)).toHaveClass('ring-yellow'));
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('never renders a body as markup: the highlight is built from text', async () => {
    const setup = setupCore();
    setup.deps.fakes.chat.receive({
      chatId: CHAT.id,
      fromJid: CHAT.peerJid,
      body: '<b>lunch</b> <img src=x>',
    });
    setup.deps.fakes.chat.receive({ chatId: CHAT.id, fromJid: CHAT.peerJid, body: 'Or a walk' });
    renderConversation(setup);
    await openAndType('lunch');
    await screen.findByText('1 of 1');
    expect(bar().querySelector('b, img')).toBeNull();
    expect(bar()).toHaveTextContent('<b>lunch</b> <img src=x>');
  });

  it('says so when nothing matches', async () => {
    lunchChat();
    await openAndType('dinner');
    expect(await screen.findByText('No match')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search older messages' })).not.toBeInTheDocument();
  });

  it('searches older messages from the cursor, then loads the pages up to the hit', async () => {
    const { core, last } = lunchChat();
    const older = message({ id: 'old-1', chatId: CHAT.id, body: 'lunch last year' });
    const search = vi.spyOn(core.archive, 'search');
    search.mockImplementation(async (_chatId, _query, cursor) =>
      cursor
        ? { items: [{ message: older, ranges: [{ start: 0, end: 5 }] }] }
        : { items: [{ message: last, ranges: [] }], next: { before: 'some-letter' } },
    );
    const loadOlder = vi.spyOn(core.chats, 'loadOlder').mockResolvedValueOnce([older]);
    await openAndType('lunch');
    expect(await screen.findByText('1 of 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search older messages' }));
    expect(await screen.findByText('2 of 2')).toBeInTheDocument();
    expect(search).toHaveBeenLastCalledWith(CHAT.id, 'lunch', { before: 'some-letter' });
    // Not loaded in the list yet: the older page comes first, then the letter is shown.
    await waitFor(() => expect(bubbleOf('old-1')).toHaveClass('ring-yellow'));
    expect(loadOlder).toHaveBeenCalledWith(CHAT.id);
    expect(screen.queryByRole('button', { name: 'Search older messages' })).not.toBeInTheDocument();
  });

  it('closes on Esc and gives the focus back to the composer', async () => {
    lunchChat();
    await openAndType('lunch');
    await screen.findByText('1 of 2');
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement?.tagName).toBe('TEXTAREA'));
  });

  it('opens from the header’s Search button too', async () => {
    lunchChat();
    await screen.findByText('Or a walk', { selector: 'p, p *' });
    act(() => screen.getByRole('button', { name: 'Search' }).click());
    expect(field()).toHaveFocus();
  });
});
