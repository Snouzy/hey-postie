import { DomainError } from '@hey-postie/core';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT, parcel, renderConversation, stubObjectUrls } from './parcel-test-helpers';

let urls: ReturnType<typeof stubObjectUrls>;
beforeEach(() => {
  urls = stubObjectUrls();
});
afterEach(() => vi.restoreAllMocks());

describe('Receiving a parcel', () => {
  it('shows an inline image from the fetched bytes, never from the raw URL', async () => {
    const { deps, onSaveFile } = renderConversation();
    const sealed = parcel({ encryption: 'aesgcm', decryptionKey: 'iv+key' });
    const blob = new Blob(['png'], { type: 'image/png' });
    deps.fakes.file.store(sealed.url, blob);
    act(() => {
      deps.fakes.chat.receive({
        chatId: CHAT.id,
        fromJid: 'bob@example.org',
        body: '',
        attachments: [sealed],
      });
    });
    const image = await screen.findByRole('img', { name: 'cat.png' });
    expect(image).toHaveAttribute('src', 'blob:cat');
    expect(urls.createObjectURL).toHaveBeenCalledWith(blob);
    expect(document.querySelector('img[src^="https://"]')).toBeNull();
    expect(screen.getByTitle('Sealed parcel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View cat.png' }));
    const dialog = screen.getByRole('dialog', { name: 'cat.png' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(onSaveFile).toHaveBeenCalledWith(blob, 'cat.png');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('revokes the object URL when the image leaves the screen', async () => {
    const { deps, view } = renderConversation();
    act(() => {
      deps.fakes.chat.receive({
        chatId: CHAT.id,
        fromJid: 'bob@example.org',
        body: '',
        attachments: [parcel()],
      });
    });
    await screen.findByRole('img', { name: 'cat.png' });
    view.unmount();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:cat');
  });

  it('says so when the parcel cannot be fetched, and tries again on Retry', async () => {
    const { deps, core } = renderConversation();
    vi.spyOn(core.files, 'fetch').mockRejectedValueOnce(new DomainError('ServerUnreachable'));
    act(() => {
      deps.fakes.chat.receive({
        chatId: CHAT.id,
        fromJid: 'bob@example.org',
        body: '',
        attachments: [parcel()],
      });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('I could not fetch this parcel.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('img', { name: 'cat.png' })).toBeInTheDocument();
  });

  it('shows other files as a card whose Save fetches the bytes', async () => {
    const { deps, onSaveFile } = renderConversation();
    const pdf = parcel({
      url: 'https://upload.example.org/doc.pdf',
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      size: 3 * 1024 * 1024,
    });
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    deps.fakes.file.store(pdf.url, blob);
    act(() => {
      deps.fakes.chat.receive({
        chatId: CHAT.id,
        fromJid: 'bob@example.org',
        body: '',
        attachments: [pdf],
      });
    });
    expect(await screen.findByText('doc.pdf')).toBeInTheDocument();
    expect(screen.getByText('3 MB')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(deps.fakes.file.fetched).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaveFile).toHaveBeenCalledWith(blob, 'doc.pdf'));
    expect(deps.fakes.file.fetched).toEqual([pdf.url]);
  });
});
