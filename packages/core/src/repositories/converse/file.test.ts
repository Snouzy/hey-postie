import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DomainError } from '../../contracts/errors';
import type { Attachment } from '../../contracts/types';
import { ConverseFileRepository } from './file';

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
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
    return new Response(body, { status, headers });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** What Converse's `encryptFile` produces: AES-256-GCM, 12-byte IV (16 accepted too), key = hex(iv) + hex(key). */
async function sealed(ivBytes = 12): Promise<{ bytes: ArrayBuffer; ivkey: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(ivBytes));
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return { bytes, ivkey: hex(iv) + hex(raw) };
}

const text = async (blob: Blob) => new TextDecoder().decode(await blob.arrayBuffer());

afterEach(() => vi.unstubAllGlobals());

describe('ConverseFileRepository.fetch', () => {
  it('downloads a plain attachment once, without following redirects, and caches it', async () => {
    const fetch = serve(plain, { 'content-length': String(plain.byteLength) });
    const files = new ConverseFileRepository();
    const blob = await files.fetch(attachment());
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(plain);
    await files.fetch(attachment());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://upload.example.org/get/parcel.txt');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });

  it('types the blob only for displayable images, never for svg or anything else', async () => {
    serve(plain);
    const files = new ConverseFileRepository();
    expect((await files.fetch(attachment())).type).toBe('application/octet-stream');
    expect(
      (await files.fetch(attachment({ url: 'https://x.org/a.svg', mimeType: 'image/svg+xml' })))
        .type,
    ).toBe('application/octet-stream');
    expect(
      (await files.fetch(attachment({ url: 'https://x.org/a.png', mimeType: 'image/png' }))).type,
    ).toBe('image/png');
  });

  it('decrypts an aesgcm attachment with the hex iv+key (12 or 16-byte IV), fetched over https', async () => {
    const twelve = await sealed(12);
    let fetch = serve(twelve.bytes);
    const files = new ConverseFileRepository();
    const encrypted = attachment({
      url: 'aesgcm://upload.example.org/get/parcel.txt',
      encryption: 'aesgcm',
      decryptionKey: twelve.ivkey,
    });
    expect(await text(await files.fetch(encrypted))).toBe('a small parcel, sealed');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://upload.example.org/get/parcel.txt');

    const sixteen = await sealed(16);
    fetch = serve(sixteen.bytes);
    // Same URL, other key: a different cache entry, fetched again.
    expect(await text(await files.fetch({ ...encrypted, decryptionKey: sixteen.ivkey }))).toBe(
      'a small parcel, sealed',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
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

  it('refuses an attachment above the cap: announced, or counted while streaming past a lying header', async () => {
    const files = new ConverseFileRepository(undefined, { maxDownloadBytes: 100 });
    serve(plain, { 'content-length': '101' });
    await expect(files.fetch(attachment())).rejects.toMatchObject({ code: 'Unknown' });
    const big = new Uint8Array(150);
    serve(big, { 'content-length': '10' });
    await expect(files.fetch(attachment({ url: 'https://x.org/lying' }))).rejects.toMatchObject({
      code: 'Unknown',
    });
    serve(big);
    await expect(files.fetch(attachment({ url: 'https://x.org/silent' }))).rejects.toMatchObject({
      code: 'Unknown',
    });
    serve(new Uint8Array(100));
    expect((await files.fetch(attachment({ url: 'https://x.org/fits' }))).size).toBe(100);
  });

  it('bounds the cache by bytes, oldest out first, and clears on demand', async () => {
    const fetch = serve(new Uint8Array(60));
    const files = new ConverseFileRepository(undefined, { maxCacheBytes: 100 });
    await files.fetch(attachment({ url: 'https://x.org/1' }));
    await files.fetch(attachment({ url: 'https://x.org/2' }));
    await files.fetch(attachment({ url: 'https://x.org/2' }));
    expect(fetch).toHaveBeenCalledTimes(2);
    await files.fetch(attachment({ url: 'https://x.org/1' }));
    expect(fetch).toHaveBeenCalledTimes(3);
    files.clear();
    await files.fetch(attachment({ url: 'https://x.org/1' }));
    expect(fetch).toHaveBeenCalledTimes(4);
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
