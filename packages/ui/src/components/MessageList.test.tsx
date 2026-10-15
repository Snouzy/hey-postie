import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { message, renderWithCore, setupCore } from '../test-utils';
import { groupByDay, MessageList } from './MessageList';

const noop = async () => {};

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
      {...props}
    />,
    core,
  );
  return { onRetry, onOpenLink };
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

  it('turns http and xmpp links into anchors routed through onOpenLink, nothing else', () => {
    const { onOpenLink } = renderList([
      message({ body: 'see https://example.org/a and xmpp:bob@x.org, not ftp://nope' }),
    ]);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://example.org/a',
      'xmpp:bob@x.org,',
    ]);
    expect(links[0]).toHaveAttribute('rel', 'noreferrer');
    fireEvent.click(links[0] as HTMLElement);
    expect(onOpenLink).toHaveBeenCalledWith('https://example.org/a');
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
