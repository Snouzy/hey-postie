import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { message, renderWithCore, setupCore } from '../test-utils';
import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';

const PEOPLE = [
  { nick: 'anna', present: false },
  { nick: 'Annie', present: true },
  { nick: 'bob', present: true },
];

function setup() {
  const { core } = setupCore();
  const onSend = vi.fn(async () => {});
  renderWithCore(<Composer chatId="hall@rooms.x.org" onSend={onSend} people={PEOPLE} />, core);
  return { onSend, area: screen.getByRole('textbox') as HTMLTextAreaElement };
}

function type(area: HTMLElement, value: string) {
  fireEvent.change(area, { target: { value } });
}

describe('Composer: @ mentions', () => {
  it('lists the members after an @, present first, the field pointing at the active one', () => {
    const { area } = setup();
    type(area, 'hi @');
    const list = screen.getByRole('listbox', { name: 'People to mention' });
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['@Annie', '@bob', '@anna']);
    expect(area).toHaveAttribute('aria-controls', list.id);
    expect(area).toHaveAttribute('aria-activedescendant', options[0]?.id);
    type(area, 'hi @ann');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '@Annie',
      '@anna',
    ]);
  });

  it('moves with the arrows and puts @nick in place with Enter, without sending', () => {
    const { area, onSend } = setup();
    type(area, 'hi @an');
    fireEvent.keyDown(area, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(area).toHaveValue('hi @anna ');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('picks with Tab and with a click; Esc closes the list until another @', () => {
    const { area } = setup();
    type(area, '@b');
    fireEvent.keyDown(area, { key: 'Tab' });
    expect(area).toHaveValue('@bob ');
    type(area, '@bob @');
    fireEvent.click(screen.getAllByRole('option')[0] as HTMLElement);
    expect(area).toHaveValue('@bob @Annie ');
    type(area, 'x @a');
    fireEvent.keyDown(area, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    type(area, 'x @a @');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('lists nobody in a direct chat', () => {
    const { core } = setupCore();
    renderWithCore(<Composer chatId="bob@x.org" onSend={vi.fn(async () => {})} />, core);
    type(screen.getByRole('textbox'), 'hi @');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('mention chips in a letter', () => {
  it('shows each mention as @nick, the one naming me stronger', () => {
    const { core } = setupCore();
    const letter = message({
      body: 'anna and romeo, look',
      mentions: [
        { begin: 0, end: 4, nick: 'anna' },
        { begin: 9, end: 14, nick: 'romeo' },
      ],
    });
    renderWithCore(
      <MessageBubble
        message={letter}
        last
        onRetry={vi.fn()}
        onOpenLink={vi.fn()}
        onReact={vi.fn()}
        onSaveFile={vi.fn(async () => {})}
        ownNick="Romeo"
      />,
      core,
    );
    expect(screen.getByText('@anna')).toHaveAttribute('data-mention', 'other');
    expect(screen.getByText('@romeo')).toHaveAttribute('data-mention', 'me');
    expect(screen.getByText(', look', { exact: false })).toBeInTheDocument();
  });
});
