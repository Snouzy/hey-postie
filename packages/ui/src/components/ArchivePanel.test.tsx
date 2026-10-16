import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { message, renderWithCore, setupCore } from '../test-utils';
import { ArchivePanel } from './ArchivePanel';
import { CHAT, knowBob, parcel, stubObjectUrls } from './parcel-test-helpers';

beforeEach(() => {
  stubObjectUrls();
});
afterEach(() => vi.restoreAllMocks());

const PDF = parcel({
  url: 'https://upload.example.org/doc.pdf',
  name: 'doc.pdf',
  mimeType: 'application/pdf',
  size: 3 * 1024 * 1024,
});

/** Bob's chat with a picture, a link with its preview and a document, and the archive open. */
function openArchive({ known = false } = {}) {
  const { deps, core } = setupCore();
  if (known) knowBob(deps);
  const { chat } = deps.fakes;
  const picture = chat.receive({
    chatId: CHAT.id,
    fromJid: CHAT.peerJid,
    body: '',
    attachments: [parcel()],
  });
  const link = chat.receive({
    chatId: CHAT.id,
    fromJid: CHAT.peerJid,
    body: 'Look: https://example.org/page.',
    linkPreviews: [{ url: 'https://example.org/page', title: 'A page', siteName: 'Example' }],
  });
  const document = chat.receive({
    chatId: CHAT.id,
    fromJid: CHAT.peerJid,
    body: '',
    attachments: [PDF],
  });
  deps.fakes.file.store(parcel().url, new Blob(['png'], { type: 'image/png' }));
  deps.fakes.file.store(PDF.url, new Blob(['pdf'], { type: 'application/pdf' }));
  const props = {
    onBack: vi.fn(),
    onClose: vi.fn(),
    onOpenLink: vi.fn(),
    onSaveFile: vi.fn(),
    onShowInChat: vi.fn(),
  };
  renderWithCore(<ArchivePanel chat={CHAT} {...props} />, core);
  return { deps, core, props, picture, link, document };
}

describe('Media, links and documents', () => {
  it('waits for a click before fetching a picture from someone not in the address book', async () => {
    const { deps } = openArchive();
    const load = await screen.findByRole('button', { name: 'Load cat.png' });
    expect(deps.fakes.file.fetched).toEqual([]);
    fireEvent.click(load);
    expect(await screen.findByRole('img', { name: 'cat.png' })).toBeInTheDocument();
    expect(deps.fakes.file.fetched).toEqual([parcel().url]);
  });

  it('shows a contact’s picture at once, opens it large, and shows it in the chat', async () => {
    const { props, picture } = openArchive({ known: true });
    fireEvent.click(await screen.findByRole('button', { name: 'View cat.png' }));
    const viewer = screen.getByRole('dialog', { name: 'cat.png' });
    fireEvent.click(within(viewer).getByRole('button', { name: 'Show in chat' }));
    expect(props.onShowInChat).toHaveBeenCalledWith(picture.id);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the links with their preview, and opens them through onOpenLink', async () => {
    const { props, link } = openArchive();
    fireEvent.click(screen.getByRole('button', { name: 'Links' }));
    const page = await screen.findByRole('link', { name: 'A page' });
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByText('https://example.org/page')).toBeInTheDocument();
    expect(screen.getByText(/^bob · /)).toBeInTheDocument();
    fireEvent.click(page);
    expect(props.onOpenLink).toHaveBeenCalledWith('https://example.org/page');
    fireEvent.click(screen.getByRole('button', { name: 'Show in chat' }));
    expect(props.onShowInChat).toHaveBeenCalledWith(link.id);
  });

  it('lists the documents with their size, and downloads one on click', async () => {
    const { props, document } = openArchive();
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    expect(screen.getByRole('button', { name: 'Documents' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const row = await screen.findByRole('button', { name: /doc\.pdf/ });
    expect(row).toHaveTextContent('3 MB · bob');
    fireEvent.click(row);
    await waitFor(() => expect(props.onSaveFile).toHaveBeenCalledWith(expect.any(Blob), 'doc.pdf'));
    fireEvent.click(screen.getByRole('button', { name: 'Show in chat' }));
    expect(props.onShowInChat).toHaveBeenCalledWith(document.id);
  });

  it('loads older batches while the start of the conversation is not reached', async () => {
    const { core } = openArchive();
    const older = message({ chatId: CHAT.id, attachments: [{ ...PDF, name: 'old.pdf' }] });
    const collect = vi.spyOn(core.archive, 'collect');
    collect.mockResolvedValueOnce({ items: [], next: { before: 'x' } });
    collect.mockResolvedValueOnce({
      items: [{ kind: 'document', message: older, attachment: older.attachments[0] ?? PDF }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    expect(await screen.findByText('Nothing in the latest messages.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    expect(await screen.findByText('old.pdf')).toBeInTheDocument();
    expect(collect).toHaveBeenLastCalledWith(CHAT.id, 'document', { before: 'x' });
    expect(screen.queryByRole('button', { name: 'Load older' })).not.toBeInTheDocument();
  });

  it('says so when a tab has nothing at all', async () => {
    const { core } = openArchive();
    vi.spyOn(core.archive, 'collect').mockResolvedValue({ items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Links' }));
    expect(await screen.findByText('No links yet.')).toBeInTheDocument();
  });

  it('goes back to the details and closes the pane', () => {
    const { props } = openArchive();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the details' }));
    expect(props.onBack).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
