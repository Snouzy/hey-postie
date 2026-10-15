import type { Message } from '@hey-postie/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../core/CoreProvider';
import { mergeById } from '../core/useMessages';
import { message, renderWithCore, setupCore } from '../test-utils';
import { groupByDay, MessageList } from './MessageList';

const noop = async () => true;

function renderList(
  messages = [message()],
  props: Partial<Parameters<typeof MessageList>[0]> = {},
) {
  const { core } = setupCore();
  const onRetry = vi.fn();
  const onOpenLink = vi.fn();
  renderWithCore(
    <MessageList
      messages={messages}
      hasOlder={false}
      onLoadOlder={noop}
      onRetry={onRetry}
      onOpenLink={onOpenLink}
      onReact={() => {}}
      onSaveFile={() => {}}
      {...props}
    />,
    core,
  );
  return { core, onRetry, onOpenLink };
}

describe('groupByDay', () => {
  it('groups by day, then by consecutive sender', () => {
    const monday = new Date(2026, 9, 12, 9, 0);
    const tuesday = new Date(2026, 9, 13, 9, 0);
    const days = groupByDay([
      message({ fromJid: 'bob', sentAt: monday }),
      message({ fromJid: 'bob', sentAt: monday }),
      message({ fromJid: 'me', sentAt: monday }),
      message({ fromJid: 'bob', sentAt: monday }),
      message({ fromJid: 'bob', sentAt: tuesday }),
    ]);
    expect(days).toHaveLength(2);
    expect(days[0]?.runs.map((run) => [run.fromJid, run.messages.length])).toEqual([
      ['bob', 2],
      ['me', 1],
      ['bob', 1],
    ]);
    expect(days[1]?.runs).toHaveLength(1);
  });
});

describe('MessageList', () => {
  it('labels days: Today, Yesterday, then the date', () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10);
    renderList([
      message({ sentAt: new Date(2026, 0, 5, 10) }),
      message({ sentAt: yesterday }),
      message({ sentAt: now }),
    ]);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['January 5, 2026', 'Yesterday', 'Today']);
  });

  it('offers a retry on a failed message that sends it again', () => {
    const failed = message({ direction: 'out', fromJid: 'me', status: 'failed', body: 'oops' });
    const { onRetry } = renderList([failed]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith(failed);
  });

  it('shows Postie’s sentence instead of an empty bubble for an undecryptable message', () => {
    renderList([message({ body: '', encryption: 'undecryptable' })]);
    expect(screen.getByText(/sealed for another device/)).toBeInTheDocument();
  });

  it('turns http and xmpp links into anchors, strips trailing punctuation, ignores the rest', () => {
    const { core, onOpenLink } = renderList([
      message({ body: 'see https://example.org/a. and xmpp:bob@x.org, not ftp://nope' }),
    ]);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://example.org/a',
      'xmpp:bob@x.org',
    ]);
    expect(links[0]).toHaveAttribute('rel', 'noreferrer');
    fireEvent.click(links[0] as HTMLElement);
    expect(onOpenLink).toHaveBeenCalledWith('https://example.org/a');

    // An xmpp: link stays in the app: it asks the core for that chat.
    const requested = vi.fn();
    core.events.on('chat.requested', requested);
    fireEvent.click(links[1] as HTMLElement);
    expect(requested).toHaveBeenCalledWith({ chatId: 'bob@x.org' });
    expect(onOpenLink).toHaveBeenCalledTimes(1);
  });

  it('shows the status stamp on outgoing messages', () => {
    renderList([message({ direction: 'out', fromJid: 'me', status: 'read' })]);
    expect(screen.getByTitle('Read')).toBeInTheDocument();
  });

  it('calls onLoadOlder from the top button', async () => {
    const onLoadOlder = vi.fn(noop);
    renderList([message()], { hasOlder: true, onLoadOlder });
    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    expect(onLoadOlder).toHaveBeenCalled();
  });
});

describe('mergeById', () => {
  it('keeps what arrived during the load and never duplicates an id', () => {
    const loaded = [message({ id: 'a' }), message({ id: 'b' })];
    const arrived = [message({ id: 'b' }), message({ id: 'c' })];
    expect(mergeById(loaded, arrived).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('MessageList scroll anchor', () => {
  /** Bubbles 50px apart, in DOM order; the scroller itself at the top of the page. */
  function stubLayout() {
    return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const bubbles = [...document.querySelectorAll('[data-message-id]')];
      const top = bubbles.includes(this) ? bubbles.indexOf(this) * 50 : 0;
      return { top, bottom: top + 40, left: 0, right: 100, width: 100, height: 40 } as DOMRect;
    });
  }

  it('holds the first message in place when older ones land, even if a letter arrived meanwhile', async () => {
    const layout = stubLayout();
    const m = (n: number) => message({ id: `m${n}`, body: `m${n}` });
    const [m1, m2, m3, m4, m5] = [m(1), m(2), m(3), m(4), m(5)] as const;
    let prepend!: (ok: boolean) => void;
    const { core } = setupCore();
    const list = (messages: Message[]) => (
      <CoreProvider core={core} locale="en">
        <MessageList
          messages={messages}
          hasOlder
          onLoadOlder={() => new Promise<boolean>((done) => (prepend = done))}
          onRetry={() => {}}
          onOpenLink={() => {}}
          onReact={() => {}}
          onSaveFile={() => {}}
        />
      </CoreProvider>
    );
    const { rerender } = render(list([m3, m4]));
    const log = screen.getByRole('log');
    log.scrollTop = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    // A letter arrives at the bottom while the page is on its way: nothing to compensate yet.
    rerender(list([m3, m4, m5]));
    expect(log.scrollTop).toBe(0);
    // The page lands: m3 moved from the first row to the third, the viewport follows it.
    rerender(list([m1, m2, m3, m4, m5]));
    prepend(true);
    expect(log.scrollTop).toBe(100);
    layout.mockRestore();
  });
});
