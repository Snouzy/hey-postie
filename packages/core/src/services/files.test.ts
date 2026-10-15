import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import { createFakeDependencies } from '../fakes';
import { isInlineImage } from './files';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

const file = (name: string, size: number, type = 'image/png') =>
  new File([new Uint8Array(size)], name, { type });

describe('files.send', () => {
  it('uploads, reports progress and sends a message with the attachment', async () => {
    const chat = await core.chats.open('bob@x.org');
    const progress: number[] = [];
    const message = await core.files.send(chat.id, file('cat.png', 10), (p) => progress.push(p));
    expect(deps.fakes.chat.uploaded).toEqual([{ chatId: chat.id, name: 'cat.png' }]);
    expect(progress).toEqual([0.5, 1]);
    expect(message.attachments[0]?.name).toBe('cat.png');
  });

  it('refuses a file above the server limit before uploading', async () => {
    deps.fakes.chat.maxUpload = 100;
    const chat = await core.chats.open('bob@x.org');
    await expect(core.files.send(chat.id, file('big.bin', 101))).rejects.toThrow(/FileTooLarge/);
    expect(deps.fakes.chat.uploaded).toEqual([]);
  });

  it('uploads when the server announces no limit', async () => {
    deps.fakes.chat.maxUpload = null;
    const chat = await core.chats.open('bob@x.org');
    await core.files.send(chat.id, file('big.bin', 10_000_000));
    expect(deps.fakes.chat.uploaded).toHaveLength(1);
  });
});

describe('files.fetch', () => {
  it('returns the stored bytes', async () => {
    deps.fakes.file.store('https://u/x.png', new Blob(['abc']));
    const blob = await core.files.fetch({
      url: 'https://u/x.png',
      name: 'x.png',
      size: 3,
      mimeType: 'image/png',
      encryption: 'none',
    });
    expect(await blob.text()).toBe('abc');
  });
});

describe('isInlineImage', () => {
  const att = (mimeType: string, size: number) => ({
    url: 'u',
    name: 'n',
    size,
    mimeType,
    encryption: 'none' as const,
  });
  it('accepts common images under the limit, unknown sizes included', () => {
    expect(isInlineImage(att('image/png', 0))).toBe(true);
    expect(isInlineImage(att('image/webp', 1000))).toBe(true);
  });
  it('refuses other types and huge images', () => {
    expect(isInlineImage(att('application/pdf', 10))).toBe(false);
    expect(isInlineImage(att('image/svg+xml', 10))).toBe(false);
    expect(isInlineImage(att('image/png', 20 * 1024 * 1024))).toBe(false);
  });
});
