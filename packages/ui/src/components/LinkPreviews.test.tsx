import type { Message } from '@hey-postie/core';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { message, renderWithCore, setupCore } from '../test-utils';
import { LinkPreviews } from './LinkPreviews';
import { knowBob, stubObjectUrls } from './parcel-test-helpers';

const PICTURE = 'https://x.org/news.png';
const letter = (extra: Partial<Message> = {}) =>
  message({
    body: 'see https://x.org/news',
    linkPreviews: [
      {
        url: 'https://x.org/news',
        title: 'Big news',
        description: 'What happened today',
        siteName: 'X',
        imageUrl: PICTURE,
      },
    ],
    ...extra,
  });

function renderPreviews(subject: Message, known: boolean) {
  const setup = setupCore();
  if (known) knowBob(setup.deps);
  setup.deps.fakes.file.store(PICTURE, new Blob(['png']));
  const onOpenLink = vi.fn();
  renderWithCore(<LinkPreviews message={subject} onOpenLink={onOpenLink} />, setup.core);
  return { ...setup, onOpenLink };
}

describe('link previews', () => {
  beforeEach(() => stubObjectUrls());

  it('shows the site, the title as a link and the description', () => {
    const { onOpenLink } = renderPreviews(letter(), false);
    const list = screen.getByRole('list', { name: 'Link previews' });
    expect(list).toHaveTextContent('X');
    expect(list).toHaveTextContent('What happened today');
    fireEvent.click(screen.getByRole('link', { name: 'Big news' }));
    expect(onOpenLink).toHaveBeenCalledWith('https://x.org/news');
  });

  it('fetches the picture for a letter from a contact, through the service', async () => {
    const { deps } = renderPreviews(letter(), true);
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'blob:cat'));
    expect(deps.fakes.file.fetched).toEqual([PICTURE]);
  });

  it('never fetches the picture for someone not in the address book', async () => {
    const { deps } = renderPreviews(letter({ fromJid: 'hall@rooms.x.org/stranger' }), false);
    await screen.findByRole('link', { name: 'Big news' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.querySelector('img')).toBeNull();
    expect(deps.fakes.file.fetched).toEqual([]);
  });

  it('shows nothing for a letter without previews', () => {
    renderPreviews(message(), true);
    expect(screen.queryByRole('list', { name: 'Link previews' })).toBeNull();
  });
});
