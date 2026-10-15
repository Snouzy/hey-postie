import { DomainError } from '@hey-postie/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupCore } from '../test-utils';
import { attach, CHAT, renderConversation } from './parcel-test-helpers';

describe('Sending a parcel', () => {
  it('uploads the picked file and shows it as a parcel card', async () => {
    const { deps } = renderConversation();
    attach([new File(['hello'], 'notes.txt', { type: 'text/plain' })]);
    await waitFor(() =>
      expect(deps.fakes.chat.uploaded).toEqual([{ chatId: CHAT.id, name: 'notes.txt' }]),
    );
    expect(await screen.findByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the pending parcel with its progress until the message arrives', async () => {
    const { core } = renderConversation();
    let progress: ((fraction: number) => void) | undefined;
    vi.spyOn(core.files, 'send').mockImplementation(
      (_chat, _file, onProgress) =>
        new Promise(() => {
          progress = onProgress;
        }),
    );
    attach([new File(['x'.repeat(2048)], 'big.bin')]);
    const bar = await screen.findByRole('progressbar', { name: 'Sending big.bin' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('2 kB')).toBeInTheDocument();
    act(() => progress?.(0.5));
    expect(bar).toHaveAttribute('aria-valuenow', '50');
  });

  it('says the limit when the parcel is too heavy', async () => {
    const { deps } = renderConversation();
    deps.fakes.chat.maxUpload = 1024;
    attach([new File(['x'.repeat(2048)], 'big.bin')]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This parcel is too heavy. The server takes up to 1 kB.',
    );
    expect(deps.fakes.chat.uploaded).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers to retry any other failure', async () => {
    const { deps, core } = renderConversation();
    vi.spyOn(core.files, 'send').mockRejectedValueOnce(new DomainError('ServerUnreachable'));
    attach([new File(['hello'], 'notes.txt')]);
    expect(await screen.findByRole('alert')).toHaveTextContent('I cannot reach this server');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(deps.fakes.chat.uploaded).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('takes files dropped on the conversation', async () => {
    const { deps } = renderConversation();
    const region = screen.getByRole('region', { name: 'bob' });
    const files = { dataTransfer: { types: ['Files'], files: [] } };
    fireEvent.dragEnter(region, files);
    expect(screen.getByRole('status')).toHaveTextContent('Drop your parcel here');
    // Crossing a child fires enter then leave: the overlay stays until the last leave.
    fireEvent.dragEnter(screen.getByRole('textbox'), files);
    fireEvent.dragLeave(screen.getByRole('textbox'), files);
    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.dragLeave(region, files);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.dragEnter(region, files);
    const file = new File(['hello'], 'dropped.txt');
    fireEvent.drop(region, { dataTransfer: { types: ['Files'], files: [file] } });
    expect(screen.queryByText('Drop your parcel here')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(deps.fakes.chat.uploaded.map((u) => u.name)).toEqual(['dropped.txt']),
    );
  });

  it('leaves drags alone outside a hall', () => {
    renderConversation(setupCore(), {
      ...CHAT,
      id: 'hall@rooms.x.org',
      kind: 'room',
      title: 'hall',
    });
    const region = screen.getByRole('region', { name: 'hall' });
    const event = fireEvent.dragEnter(region, { dataTransfer: { types: ['Files'], files: [] } });
    expect(event).toBe(true); // not defaultPrevented
    expect(screen.queryByRole('status', { name: '' })).not.toHaveTextContent(
      'Drop your parcel here',
    );
  });

  it('takes an image pasted in the composer, and leaves text pastes alone', async () => {
    const { deps } = renderConversation();
    const area = screen.getByRole('textbox');
    const textPaste = fireEvent.paste(area, {
      clipboardData: { files: [new File(['t'], 'x.txt')], getData: () => 'hello' },
    });
    expect(textPaste).toBe(true); // the textarea keeps the paste
    expect(deps.fakes.chat.uploaded).toEqual([]);
    const imagePaste = fireEvent.paste(area, {
      clipboardData: {
        files: [new File(['png'], 'shot.png', { type: 'image/png' })],
        getData: () => '',
      },
    });
    expect(imagePaste).toBe(false);
    await waitFor(() => expect(deps.fakes.chat.uploaded.map((u) => u.name)).toEqual(['shot.png']));
  });
});
