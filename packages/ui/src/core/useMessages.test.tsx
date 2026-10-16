import { MESSAGE_PAGE_SIZE, type Message } from '@hey-postie/core';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CHAT, renderConversation } from '../components/parcel-test-helpers';
import { message, setupCore } from '../test-utils';

/** A promise the test resolves by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Enough letters that the first page is full and something older may exist. */
function fullPage(deps: ReturnType<typeof setupCore>['deps']) {
  for (let i = 0; i < MESSAGE_PAGE_SIZE; i += 1) {
    deps.fakes.chat.receive({ chatId: CHAT.id, fromJid: 'bob@example.org', body: `letter ${i}` });
  }
}

describe('useMessages', () => {
  it('offers to load older letters only when the first page is full', async () => {
    const short = renderConversation();
    short.deps.fakes.chat.receive({ chatId: CHAT.id, fromJid: 'bob@example.org', body: 'only' });
    await screen.findByText('only');
    expect(screen.queryByRole('button', { name: 'Load older' })).not.toBeInTheDocument();
    short.view.unmount();

    const full = setupCore();
    fullPage(full.deps);
    renderConversation(full);
    await screen.findByText('letter 0');
    expect(screen.getByRole('button', { name: 'Load older' })).toBeInTheDocument();
  });

  it('lets an update that arrives during the first load win over the loaded page', async () => {
    const setup = setupCore();
    const { deps, core } = setup;
    const letter = deps.fakes.chat.receive({
      chatId: CHAT.id,
      fromJid: 'bob@example.org',
      body: 'draft',
    });
    const page = deferred<Message[]>();
    vi.spyOn(core.chats, 'messages').mockReturnValue(page.promise);
    renderConversation(setup);
    act(() => deps.fakes.chat.update({ ...letter, body: 'final', edited: true }));
    await act(async () => page.resolve([letter]));
    expect(screen.getByText('final')).toBeInTheDocument();
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
  });

  it('lets an update that arrives while an older page loads win over that page', async () => {
    const setup = setupCore();
    const { deps, core } = setup;
    const old = message({ id: 'old', chatId: CHAT.id, body: 'old draft' });
    deps.fakes.chat.history(CHAT.id, [old]);
    fullPage(deps);
    deps.fakes.chat.receive({ chatId: CHAT.id, fromJid: 'bob@example.org', body: 'recent' });
    const page = deferred<Message[]>();
    vi.spyOn(core.chats, 'loadOlder').mockReturnValue(page.promise);
    renderConversation(setup);
    await screen.findByText('recent');
    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    act(() => deps.fakes.chat.update({ ...old, body: 'old final' }));
    await act(async () => page.resolve([old]));
    expect(screen.getByText('old final')).toBeInTheDocument();
    expect(screen.queryByText('old draft')).not.toBeInTheDocument();
  });
});
