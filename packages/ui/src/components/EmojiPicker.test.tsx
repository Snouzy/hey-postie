import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithCore, setupCore } from '../test-utils';
import { Composer } from './Composer';
import { edgeFade } from './EmojiPicker';

function openPicker() {
  const { core } = setupCore();
  renderWithCore(<Composer chatId="bob@x.org" onSend={vi.fn(async () => {})} />, core);
  const area = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Write a letter…' });
  const smile = screen.getByRole('button', { name: 'Add an emoji' });
  fireEvent.click(smile);
  const picker = screen.getByRole('dialog', { name: 'Emojis' });
  return { area, smile, picker, search: screen.getByRole('searchbox', { name: 'Search emojis' }) };
}

describe('EmojiPicker', () => {
  it('opens on the search field and filters the grid by shortname', () => {
    const { search } = openPicker();
    expect(search).toHaveFocus();
    expect(screen.getByRole('button', { name: 'smiley' })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'grin' } });
    expect(screen.getByRole('button', { name: 'grin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'grinning' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'smiley' })).not.toBeInTheDocument();
    // Categories step aside while searching; a keyword finds its emoji too.
    expect(screen.queryByRole('button', { name: 'Flags' })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'thinking face' } });
    expect(screen.getByRole('button', { name: 'thinking' })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'zzzzzz' } });
    expect(screen.getByText('No emoji by that name.')).toBeInTheDocument();
  });

  it('switches categories with pressed buttons', () => {
    openPicker();
    expect(screen.getByRole('button', { name: 'Smileys' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Flags' }));
    expect(screen.getByRole('button', { name: 'Flags' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'checkered_flag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'smiley' })).not.toBeInTheDocument();
  });

  it('inserts the emoji at the caret, closes and focuses the text', async () => {
    const { area, search } = openPicker();
    fireEvent.change(area, { target: { value: 'ab' } });
    area.setSelectionRange(1, 1);
    fireEvent.change(search, { target: { value: 'grin' } });
    fireEvent.click(screen.getByRole('button', { name: 'grin' }));
    expect(area).toHaveValue('a😁b');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(area).toHaveFocus();
    await waitFor(() => expect(area.selectionStart).toBe('a😁'.length));
  });

  it('moves with the arrows in the grid and closes on Esc with the focus back', () => {
    const { smile, search } = openPicker();
    const cells = screen.getAllByRole('button', { name: /^[a-z0-9_]+$/ });
    // One Tab stop: the first cell, the others are reached with the arrows.
    expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([cells[0]]);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const first = screen.getByRole('button', { name: 'smiley' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = screen.getByRole('button', { name: 'smile' });
    expect(second).toHaveFocus();
    expect(second.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(cells[9]).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(smile).toHaveFocus();
  });

  it('fades the edge of the category strip that hides more', () => {
    const strip = (scrollLeft: number, clientWidth: number, scrollWidth: number) =>
      ({ scrollLeft, clientWidth, scrollWidth }) as HTMLElement;
    expect(edgeFade(null)).toBe('none');
    expect(edgeFade(strip(0, 320, 320))).toBe('none');
    expect(edgeFade(strip(0, 320, 500))).toBe('right');
    expect(edgeFade(strip(100, 320, 500))).toBe('both');
    expect(edgeFade(strip(180, 320, 500))).toBe('left');
  });

  it('closes on a click outside', () => {
    const { area } = openPicker();
    fireEvent.pointerDown(area);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
