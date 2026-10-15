import type { Chat, Message } from '@hey-postie/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithCore, setupCore } from '../test-utils';
import { Conversation } from './Conversation';

const CHAT: Chat = {
  id: 'bob@example.org',
  kind: 'direct',
  peerJid: 'bob@example.org',
  title: 'bob',
  unreadCount: 0,
  encrypted: false,
};
const noop = () => {};

async function signedInConversation(reactions: Message['reactions'] = []) {
  const { deps, core } = setupCore();
  deps.fakes.chat.myJid = 'alice@x.org';
  await core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false });
  renderWithCore(
    <Conversation
      chat={CHAT}
      contact={undefined}
      room={undefined}
      detailsOpen={false}
      onToggleDetails={noop}
      onOpenEncryption={noop}
      onOpenLink={noop}
      onSaveFile={noop}
    />,
    core,
  );
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
    fireEvent.click(screen.getByRole('button', { name: '👍' }));
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
      { emoji: '❤️', fromJids: ['bob@example.org', 'alice@x.org'], mine: true },
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

  it('lists the reactions row under its label', async () => {
    await signedInConversation([{ emoji: '🙏', fromJids: ['bob@example.org'], mine: false }]);
    expect(screen.getByRole('list', { name: 'Reactions' })).toBeInTheDocument();
  });
});
