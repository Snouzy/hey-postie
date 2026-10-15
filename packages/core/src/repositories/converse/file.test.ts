import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DomainError } from '../../contracts/errors';
import type { Attachment } from '../../contracts/types';
import { ConverseFileRepository, MAX_DOWNLOAD_BYTES } from './file';

/** `fetch` replaced by a stub: no network; the aesgcm fixture is encrypted here with WebCrypto. */

const plain = new TextEncoder().encode('a small parcel, sealed');
const attachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  url: 'https://upload.example.org/get/parcel.txt',
  name: 'parcel.txt',
  size: plain.byteLength,
  mimeType: 'text/plain',
  encryption: 'none',
  ...overrides,
});

function serve(body: BufferSource, headers: Record<string, string> = {}, status = 200) {
  const fetch = vi.fn(async (_url: string) => new Response(body, { status, headers }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** What Converse's `encryptFile` produces: AES-256-GCM, 12-byte IV, key = hex(iv) + hex(key). */
async function sealed(): Promise<{ bytes: ArrayBuffer; ivkey: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return { bytes, ivkey: hex(iv) + hex(raw) };
}

afterEach(() => vi.unstubAllGlobals());

describe('ConverseFileRepository.fetch', () => {
  it('downloads a plain attachment once and caches it by URL', async () => {
    const fetch = serve(plain, { 'content-length': String(plain.byteLength) });
    const files = new ConverseFileRepository();
    const blob = await files.fetch(attachment());
    expect(blob.type).toBe('text/plain');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(plain);
    await files.fetch(attachment());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://upload.example.org/get/parcel.txt');
  });

  it('decrypts an aesgcm attachment with the hex iv+key, fetched over https', async () => {
    const { bytes, ivkey } = await sealed();
    const fetch = serve(bytes);
    const files = new ConverseFileRepository();
    const blob = await files.fetch(
      attachment({
        url: 'aesgcm://upload.example.org/get/parcel.txt',
        encryption: 'aesgcm',
        decryptionKey: ivkey,
      }),
    );
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe('a small parcel, sealed');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://upload.example.org/get/parcel.txt');
  });

  it('rejects a wrong or malformed key with Unknown', async () => {
    const { bytes, ivkey } = await sealed();
    serve(bytes);
    const files = new ConverseFileRepository();
    const encrypted = attachment({ url: 'aesgcm://x.org/f', encryption: 'aesgcm' });
    const wrong = `${ivkey.slice(0, -2)}00`;
    const error = await files
      .fetch({ ...encrypted, decryptionKey: wrong })
      .catch((e: unknown) => e as DomainError);
    expect((error as DomainError).code).toBe('Unknown');
    await expect(files.fetch({ ...encrypted, decryptionKey: 'abc' })).rejects.toMatchObject({
      code: 'Unknown',
    });
    await expect(files.fetch(encrypted)).rejects.toMatchObject({ code: 'Unknown' });
  });

  it('refuses http URLs without touching the network', async () => {
    const fetch = serve(plain);
    const files = new ConverseFileRepository();
    const error = (await files
      .fetch(attachment({ url: 'http://upload.example.org/get/parcel.txt' }))
      .catch((e: unknown) => e)) as DomainError;
    expect(error.code).toBe('Unknown');
    expect(error.message.startsWith('Unknown')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses an attachment above the size cap, announced or measured', async () => {
    serve(plain, { 'content-length': String(MAX_DOWNLOAD_BYTES + 1) });
    const files = new ConverseFileRepository();
    await expect(files.fetch(attachment())).rejects.toMatchObject({ code: 'Unknown' });
    // Without a Content-Length header the bytes are counted once read.
    const big = new Uint8Array(1024);
    serve(big);
    const spy = vi
      .spyOn(Response.prototype, 'arrayBuffer')
      .mockResolvedValue(new ArrayBuffer(MAX_DOWNLOAD_BYTES + 1));
    await expect(files.fetch(attachment({ url: 'https://x.org/big' }))).rejects.toMatchObject({
      code: 'Unknown',
    });
    spy.mockRestore();
  });

  it('turns HTTP errors and network failures into Unknown', async () => {
    serve(plain, {}, 404);
    const files = new ConverseFileRepository();
    await expect(files.fetch(attachment())).rejects.toMatchObject({ code: 'Unknown' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await expect(files.fetch(attachment({ url: 'https://x.org/other' }))).rejects.toMatchObject({
      code: 'Unknown',
    });
  });
});
