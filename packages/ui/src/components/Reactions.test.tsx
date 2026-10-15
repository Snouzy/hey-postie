import type { Message } from '@hey-postie/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setupCore } from '../test-utils';
import { CHAT, renderConversation } from './parcel-test-helpers';

async function signedInConversation(reactions: Message['reactions'] = []) {
  const setup = setupCore();
  const { deps, core } = setup;
  deps.fakes.chat.myJid = 'alice@x.org';
  await core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false });
  renderConversation(setup);
  let received!: Message;
  act(() => {
    received = deps.fakes.chat.receive({
      chatId: CHAT.id,
      fromJid: 'bob@example.org',
      body: 'hello',
      reactions,
    });
  });
  await screen.findByText('hello');
  return { deps, core, received };
}

describe('Reactions', () => {
  it('reacts from the quick row and shows my pill pressed', async () => {
    const { deps, received } = await signedInConversation();
    fireEvent.click(screen.getByRole('button', { name: 'React' }));
    fireEvent.click(screen.getByRole('button', { name: 'thumbsup' }));
    await waitFor(() =>
      expect(deps.fakes.chat.reactions).toEqual([
        { chatId: CHAT.id, messageId: received.id, emojis: ['👍'] },
      ]),
    );
    const pill = await screen.findByRole('button', { name: '👍 1' });
    expect(pill).toHaveAttribute('aria-pressed', 'true');
    expect(pill).toHaveAttribute('title', 'alice');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'React' })).toHaveFocus();
  });

  it('toggles my reaction off from its pill', async () => {
    const { deps } = await signedInConversation([
      { emoji: '❤️', fromJids: ['bob@example.org', 'alice@x.org'] },
    ]);
    const pill = screen.getByRole('button', { name: '❤️ 2' });
    expect(pill).toHaveAttribute('aria-pressed', 'true');
    expect(pill).toHaveAttribute('title', 'bob, alice');
    fireEvent.click(pill);
    await waitFor(() => expect(deps.fakes.chat.reactions[0]?.emojis).toEqual([]));
    const theirs = await screen.findByRole('button', { name: '❤️ 1' });
    expect(theirs).toHaveAttribute('aria-pressed', 'false');
    expect(theirs).toHaveAttribute('title', 'bob');
  });

  it('reaches the whole picker through "More emojis"', async () => {
    const { deps } = await signedInConversation();
    fireEvent.click(screen.getByRole('button', { name: 'React' }));
    fireEvent.click(screen.getByRole('button', { name: 'More emojis' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'grin' } });
    fireEvent.click(screen.getByRole('button', { name: 'grin' }));
    await waitFor(() => expect(deps.fakes.chat.reactions[0]?.emojis).toEqual(['😁']));
    expect(await screen.findByRole('button', { name: '😁 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('puts the focus on the first quick emoji, and Esc from anywhere closes it', async () => {
    await signedInConversation();
    const react = screen.getByRole('button', { name: 'React' });
    react.focus();
    fireEvent.click(react);
    expect(screen.getByRole('button', { name: 'thumbsup' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'heart' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(react).toHaveFocus();
  });

  it('lists the reactions row under its label', async () => {
    await signedInConversation([{ emoji: '🙏', fromJids: ['bob@example.org'] }]);
    expect(screen.getByRole('list', { name: 'Reactions' })).toBeInTheDocument();
  });
});
