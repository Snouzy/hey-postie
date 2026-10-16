import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithCore, setupCore } from '../test-utils';
import { Composer } from './Composer';
import { MessageText } from './MessageText';

function renderText(props: Partial<Parameters<typeof MessageText>[0]> & { body: string }) {
  const onOpenLink = vi.fn();
  const view = renderWithCore(
    <MessageText outgoing={false} onOpenLink={onOpenLink} {...props} />,
    setupCore().core,
  );
  return { onOpenLink, container: view.container };
}

describe('a styled letter (XEP-0393)', () => {
  it('draws bold, italic, strike and code as elements, the directives kept and quieter', () => {
    const { container } = renderText({ body: 'a *b* _i_ ~s~ `c`' });
    expect(container.querySelector('strong')).toHaveTextContent('*b*');
    expect(container.querySelector('em')).toHaveTextContent('_i_');
    expect(container.querySelector('s')).toHaveTextContent('~s~');
    expect(container.querySelector('code')).toHaveTextContent('`c`');
    expect(container.querySelector('strong > span')).toHaveClass('opacity-50');
    expect(container.querySelector('p')).toHaveTextContent('a *b* _i_ ~s~ `c`');
  });

  it('puts quotes and code blocks in boxes of their own, in a div', () => {
    const { container } = renderText({ body: 'Look:\n> said *so*\n```js\nlet x = *1*\n```\nok' });
    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelector('blockquote')).toHaveTextContent('said *so*');
    expect(container.querySelector('blockquote strong')).toHaveTextContent('*so*');
    const pre = container.querySelector('pre');
    expect(pre).toHaveTextContent('```js let x = *1* ```', { normalizeWhitespace: true });
    expect(pre?.querySelector('strong')).toBeNull();
  });

  it('keeps links and mention chips working inside the styling', () => {
    const body = '*olga* see https://x.org';
    const { container, onOpenLink } = renderText({
      body,
      mentions: [{ begin: 1, end: 5, nick: 'olga' }],
      ownNick: 'olga',
    });
    expect(container.querySelector('strong [data-mention="me"]')).toHaveTextContent('@olga');
    fireEvent.click(screen.getByRole('link', { name: 'https://x.org' }));
    expect(onOpenLink).toHaveBeenCalledWith('https://x.org');
  });

  it('shows a letter sent with <unstyled/> as plain text', () => {
    const { container } = renderText({ body: '> _ <', unstyled: true });
    expect(container.querySelector('blockquote')).toBeNull();
    expect(container.querySelector('p')).toHaveTextContent('> _ <');
  });
});

describe('the composer’s styling keys', () => {
  afterEach(() => vi.restoreAllMocks());

  it('wraps the selection with ⌘B, ⌘I and ⌘E, and ⌘B does not reach the window', () => {
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    renderWithCore(
      <Composer chatId="bob@x.org" onSend={vi.fn(async () => {})} />,
      setupCore().core,
    );
    const area = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: 'say hi' } });
    area.setSelectionRange(4, 6);
    fireEvent.keyDown(area, { key: 'b', metaKey: true });
    expect(area).toHaveValue('say *hi*');
    expect(heard).not.toHaveBeenCalled();

    area.setSelectionRange(0, 3);
    fireEvent.keyDown(area, { key: 'i', ctrlKey: true });
    expect(area).toHaveValue('_say_ *hi*');

    area.setSelectionRange(10, 10);
    fireEvent.keyDown(area, { key: 'e', metaKey: true });
    expect(area).toHaveValue('_say_ *hi*``');
    window.removeEventListener('keydown', heard);
  });
});
