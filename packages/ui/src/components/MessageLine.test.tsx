import type { Message } from '@hey-postie/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { message, renderWithCore, setupCore } from '../test-utils';
import { MessageList } from './MessageList';

const at = (minute: number) => new Date(2026, 9, 12, 9, minute);

function renderLines(messages: Message[], props: Partial<Parameters<typeof MessageList>[0]> = {}) {
  const onAction = vi.fn();
  renderWithCore(
    <MessageList
      messages={messages}
      hasOlder={false}
      onLoadOlder={async () => false}
      onRetry={() => {}}
      onOpenLink={() => {}}
      onReact={() => {}}
      onSaveFile={() => {}}
      onAction={onAction}
      canReply
      layout="lines"
      peerName="Bob"
      ownName="Alice"
      {...props}
    />,
    setupCore().core,
  );
  return { onAction };
}

const row = (text: string): HTMLElement => {
  const found = screen.getByText(text, { selector: 'p, p *' }).closest('[data-message-id]');
  if (!(found instanceof HTMLElement)) throw new Error(`no row for ${text}`);
  return found;
};

describe('letters as lines', () => {
  it('names the first row of a run, with its time; the next rows keep the time for the hover', () => {
    renderLines([
      message({ body: 'first', sentAt: at(1) }),
      message({ body: 'second', sentAt: at(2) }),
      message({ body: 'mine', direction: 'out', fromJid: 'me', sentAt: at(3) }),
    ]);
    expect(within(row('first')).getByText('Bob')).toBeInTheDocument();
    expect(within(row('first')).getByText('9:01 AM')).toBeInTheDocument();
    expect(within(row('second')).queryByText('Bob')).toBeNull();
    expect(within(row('second')).getByText('9:02 AM').closest('span')).toHaveClass('opacity-0');
    expect(within(row('mine')).getByText('Alice')).toBeInTheDocument();
    // No bubble: no navy, no card shadow.
    expect(row('mine')).not.toHaveClass('bg-navy');
    expect(row('first')).not.toHaveClass('shadow-card');
  });

  it('keeps all a bubble shows: stamp, wax, edited, reactions, quote, mention, toolbar', () => {
    const original = message({ body: 'Lunch?', sentAt: at(1) });
    const { onAction } = renderLines([
      original,
      message({
        body: 'Yes',
        direction: 'out',
        fromJid: 'me',
        status: 'read',
        encryption: 'omemo',
        edited: true,
        sentAt: at(2),
        reactions: [{ emoji: '👍', fromJids: ['bob'], mine: false }],
        replyTo: { id: original.id, excerpt: 'Lunch?' },
      }),
      message({ body: 'hey olga', isMention: true, fromJid: 'carol', sentAt: at(3) }),
    ]);
    const mine = row('Yes');
    expect(within(mine).getByTitle('Read')).toBeInTheDocument();
    expect(within(mine).getByTitle('Sealed')).toBeInTheDocument();
    expect(within(mine).getByText('edited')).toBeInTheDocument();
    expect(within(mine).getByRole('button', { name: '👍 1' })).toBeInTheDocument();
    expect(within(mine).getByRole('button', { name: /In reply to/ })).toBeInTheDocument();
    expect(within(row('hey olga')).getByText('Mentions you')).toBeInTheDocument();
    fireEvent.click(within(row('Lunch?')).getByRole('button', { name: 'Reply' }));
    expect(onAction).toHaveBeenCalledWith(original, 'reply');
  });

  it('changes only the spacing with the density', () => {
    renderLines([message({ body: 'tight' })], { density: 'compact' });
    expect(row('tight')).toHaveClass('py-0');
  });
});

describe('Settings › Appearance: letters and density', () => {
  afterEach(() => window.localStorage.clear());

  async function signedIn() {
    const setup = setupCore();
    setup.deps.fakes.roster.seed({
      jid: 'bob@x.org',
      name: 'Bob',
      presence: 'online',
      subscription: 'both',
    });
    setup.deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'Lunch?' });
    render(<App core={setup.core} locale="en" />);
    await act(() =>
      setup.core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /bob/i }));
    await screen.findByText('Lunch?', { selector: 'p, p *' });
    return setup;
  }

  function openAppearance() {
    fireEvent.click(screen.getByRole('button', { name: 'alice' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings…' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
  }

  it('draws a direct chat in bubbles by default, in lines once chosen, and remembers it', async () => {
    await signedIn();
    expect(row('Lunch?')).toHaveClass('shadow-card');
    openAppearance();
    expect(screen.getByRole('radio', { name: /Automatic/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /^Lines/ }));
    expect(window.localStorage.getItem('hey-postie:letters-layout')).toBe('lines');
    fireEvent.click(screen.getByRole('radio', { name: 'Spacious' }));
    expect(window.localStorage.getItem('hey-postie:density')).toBe('spacious');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(row('Lunch?')).not.toHaveClass('shadow-card');
    expect(row('Lunch?')).toHaveClass('py-1.5');
  });

  it('starts from the stored choice', async () => {
    window.localStorage.setItem('hey-postie:letters-layout', 'lines');
    await signedIn();
    expect(row('Lunch?')).not.toHaveClass('shadow-card');
  });
});
