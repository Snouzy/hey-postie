import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithCore, setupCore } from '../test-utils';
import { Composer } from './Composer';
import { shortcodeAt } from './composerText';

function setup() {
  const { core } = setupCore();
  const onSend = vi.fn(async () => {});
  renderWithCore(<Composer chatId="bob@x.org" onSend={onSend} />, core);
  return { onSend, area: screen.getByRole('textbox') };
}

/** Typing puts the caret at the end, as jsdom does for a value set from outside. */
function type(area: HTMLElement, value: string) {
  fireEvent.change(area, { target: { value } });
}

describe('shortcodeAt', () => {
  it('finds `:` and two characters at a word start, up to the caret', () => {
    expect(shortcodeAt('hi :sm', 6)).toEqual({ start: 3, query: 'sm' });
    expect(shortcodeAt(':+1', 3)).toEqual({ start: 0, query: '+1' });
    expect(shortcodeAt('hi :s', 5)).toBeNull();
    expect(shortcodeAt('a:smile', 7)).toBeNull();
    expect(shortcodeAt(':smile: ', 8)).toBeNull();
    expect(shortcodeAt(':smile and', 6)).toEqual({ start: 0, query: 'smile' });
  });
});

describe('Composer: :shortcode completion', () => {
  it('lists the matches after two characters, the first one active', () => {
    const { area } = setup();
    type(area, 'well :s');
    expect(screen.queryByRole('listbox')).toBeNull();
    type(area, 'well :smi');
    const list = screen.getByRole('listbox', { name: 'Emoji suggestions' });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent(':smile:');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(area).toHaveAttribute('aria-controls', list.id);
    expect(area).toHaveAttribute('aria-activedescendant', options[0]?.id);
  });

  it('moves with the arrows and puts the pick in place of the shortcode on Enter, sending nothing', () => {
    const { area, onSend } = setup();
    type(area, 'well :smi');
    fireEvent.keyDown(area, { key: 'ArrowDown' });
    const second = screen.getAllByRole('option')[1];
    expect(area).toHaveAttribute('aria-activedescendant', second?.id);
    fireEvent.keyDown(area, { key: 'ArrowUp' });
    fireEvent.keyDown(area, { key: 'ArrowUp' });
    expect(area).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option').at(-1)?.id);
    fireEvent.keyDown(area, { key: 'ArrowDown' });
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(area).toHaveValue('well 😄');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks with Tab and with a click', () => {
    const { area } = setup();
    type(area, ':thumbsu');
    fireEvent.keyDown(area, { key: 'Tab' });
    expect(area).toHaveValue('👍');
    type(area, '👍 :tad');
    fireEvent.click(screen.getByRole('option', { name: /tada/ }));
    expect(area).toHaveValue('👍 🎉');
  });

  it('closes on Esc, after which Enter sends again', () => {
    const { area, onSend } = setup();
    type(area, 'see :smi');
    fireEvent.keyDown(area, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(area).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('see :smi');
  });
});
