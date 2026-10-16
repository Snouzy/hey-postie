import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { message, renderWithCore, setupCore } from '../test-utils';
import { actionsFor } from './MessageActions';
import { MessageBubble } from './MessageBubble';

describe('actionsFor', () => {
  it('lets me copy a text, edit and take back my sent letters, and hide anyone’s', () => {
    expect(actionsFor(message({ direction: 'out', status: 'sent' }), false)).toEqual([
      'copy',
      'edit',
      'deleteForMe',
      'deleteForEveryone',
    ]);
    expect(actionsFor(message({ direction: 'in' }), false)).toEqual(['copy', 'deleteForMe']);
  });

  it('offers no copy for a parcel alone, a deleted letter or one sealed for another device', () => {
    expect(actionsFor(message({ body: '' }), false)).toEqual(['deleteForMe']);
    expect(actionsFor(message({ retracted: true, body: '' }), false)).toEqual(['deleteForMe']);
    expect(actionsFor(message({ encryption: 'undecryptable' }), false)).toEqual(['deleteForMe']);
  });

  it('adds removal for a moderator, on someone else’s letter only', () => {
    expect(actionsFor(message({ direction: 'in' }), true)).toEqual([
      'copy',
      'deleteForMe',
      'moderate',
    ]);
    expect(actionsFor(message({ direction: 'out', status: 'sent' }), true)).not.toContain(
      'moderate',
    );
  });

  it('offers nothing on a letter on its way, nor edit on a failed or deleted one', () => {
    expect(actionsFor(message({ direction: 'out', status: 'pending' }), true)).toEqual([]);
    expect(actionsFor(message({ direction: 'out', status: 'failed' }), false)).toEqual([
      'copy',
      'deleteForMe',
    ]);
    expect(actionsFor(message({ direction: 'out', retracted: true, body: '' }), false)).toEqual([
      'deleteForMe',
    ]);
  });
});

describe('MessageBubble actions', () => {
  function renderBubble(overrides: Parameters<typeof message>[0]) {
    const { core } = setupCore();
    const onAction = vi.fn();
    const letter = message(overrides);
    renderWithCore(
      <MessageBubble
        message={letter}
        last
        onRetry={vi.fn()}
        onOpenLink={vi.fn()}
        onReact={vi.fn()}
        onSaveFile={vi.fn(async () => {})}
        onAction={onAction}
      />,
      core,
    );
    return { onAction, letter };
  }

  it('opens the menu and hands the picked action to the conversation', () => {
    const { onAction, letter } = renderBubble({ direction: 'out', status: 'sent' });
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Copy text',
      'Edit',
      'Delete for me',
      'Delete for everyone…',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onAction).toHaveBeenCalledWith(letter, 'edit');
  });

  it('shows a deleted letter in its place, and marks an edited one', () => {
    renderBubble({
      direction: 'in',
      body: '',
      retracted: true,
      retractedBy: 'moderator',
      moderationReason: 'spam',
    });
    expect(screen.getByText('A moderator removed this letter. (spam)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it('marks a corrected letter as edited', () => {
    renderBubble({ direction: 'in', body: 'fixed', edited: true });
    expect(screen.getByText('edited')).toBeInTheDocument();
  });
});
