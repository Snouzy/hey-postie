import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithCore, setupCore } from '../test-utils';
import { TYPING_STALE_MS, useTyping } from './useTyping';

function Who({ chatId }: { chatId: string }) {
  return <p data-testid="typing">{useTyping(chatId).join(',')}</p>;
}

describe('useTyping', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lists who is typing in this chat and forgets them on paused', () => {
    const { core } = setupCore();
    renderWithCore(<Who chatId="bob@x.org" />, core);
    act(() =>
      core.events.emit('chat.typing', { chatId: 'bob@x.org', fromJid: 'bob@x.org', typing: true }),
    );
    act(() =>
      core.events.emit('chat.typing', {
        chatId: 'other@x.org',
        fromJid: 'ann@x.org',
        typing: true,
      }),
    );
    expect(screen.getByTestId('typing')).toHaveTextContent('bob@x.org');
    act(() =>
      core.events.emit('chat.typing', { chatId: 'bob@x.org', fromJid: 'bob@x.org', typing: false }),
    );
    expect(screen.getByTestId('typing')).toHaveTextContent('');
  });

  it('clears a typing that got no news for 10 seconds, and restarts the clock on each one', () => {
    const { core } = setupCore();
    renderWithCore(<Who chatId="hall@rooms.x" />, core);
    const typing = (fromJid: string) =>
      act(() => core.events.emit('chat.typing', { chatId: 'hall@rooms.x', fromJid, typing: true }));
    typing('hall@rooms.x/ann');
    act(() => vi.advanceTimersByTime(TYPING_STALE_MS - 1000));
    typing('hall@rooms.x/bob');
    typing('hall@rooms.x/ann');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('typing')).toHaveTextContent('hall@rooms.x/ann,hall@rooms.x/bob');
    act(() => vi.advanceTimersByTime(TYPING_STALE_MS - 1000));
    expect(screen.getByTestId('typing')).toHaveTextContent('');
  });
});
