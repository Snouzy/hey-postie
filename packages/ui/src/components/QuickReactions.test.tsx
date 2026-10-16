import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { message, renderWithCore, setupCore } from '../test-utils';
import { MessageList } from './MessageList';

function renderLetter() {
  const { core } = setupCore();
  const onReact = vi.fn();
  const letter = message({ body: 'news' });
  renderWithCore(
    <MessageList
      messages={[letter]}
      hasOlder={false}
      onLoadOlder={async () => true}
      onRetry={() => {}}
      onOpenLink={() => {}}
      onReact={onReact}
      onSaveFile={() => {}}
    />,
    core,
  );
  return { onReact, letter };
}

const quickNames = () =>
  screen.getAllByRole('button', { name: /^React with / }).map((button) => button.textContent);

afterEach(() => window.localStorage.clear());

describe('Quick reactions in the toolbar', () => {
  it('offers 👍 ❤️ 😂 before React when nothing was used yet', () => {
    renderLetter();
    expect(quickNames()).toEqual(['👍', '❤️', '😂']);
    expect(screen.getByRole('button', { name: 'React with thumbsup' })).toBeInTheDocument();
  });

  it('reacts in one click and counts it toward my favourites', () => {
    const { onReact, letter } = renderLetter();
    fireEvent.click(screen.getByRole('button', { name: 'React with joy' }));
    expect(onReact).toHaveBeenCalledWith(letter, '😂');
    expect(JSON.parse(window.localStorage.getItem('hey-postie:emoji-usage') ?? '{}')).toEqual({
      '😂': 1,
    });
  });

  it('shows my most used emojis first, from the reactions made in the toolbar', () => {
    window.localStorage.setItem('hey-postie:emoji-usage', JSON.stringify({ '🎉': 4, '👀': 2 }));
    renderLetter();
    expect(quickNames()).toEqual(['🎉', '👀', '👍']);
  });

  it('keeps the defaults when the stored counts are unreadable', () => {
    window.localStorage.setItem('hey-postie:emoji-usage', '{oops');
    renderLetter();
    expect(quickNames()).toEqual(['👍', '❤️', '😂']);
  });
});
