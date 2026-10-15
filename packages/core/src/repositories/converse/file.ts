import { DomainError } from '../../contracts/errors';
import type { FileRepository } from '../../contracts/repositories';
import type { Attachment } from '../../contracts/types';
import type { ConverseEngine } from './engine';

/** Above this, an attachment is not downloaded at all: the UI offers the link instead. */
export const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
/** Decrypted blobs kept in memory, in bytes; the oldest go first. */
export const MAX_CACHE_BYTES = 100 * 1024 * 1024;
/** AES-256 key (64 hex chars) after a 12 or 16-byte IV, as `plugins/omemo/utils.js` `encryptFile` writes it. */
const KEY_HEX_LENGTH = 64;
const IV_HEX_LENGTHS = new Set([24, 32]);
/** The only types a Blob gets: anything else is served as bytes, never interpreted (no svg, no html). */
const DISPLAYABLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export interface FileRepositoryOptions {
  maxDownloadBytes?: number;
  maxCacheBytes?: number;
}

/**
 * Downloads attachments over HTTPS with `fetch` and decrypts `aesgcm://` ones (XEP-0454) with
 * WebCrypto: Converse uploads encrypted files but never downloads them (converse.md §7, §15). The
 * class sits with the Converse repositories because it undoes what Converse's upload did; the engine
 * is only used to drop the cache when the account signs out.
 */
export class ConverseFileRepository implements FileRepository {
  private readonly cache = new Map<string, Blob>();
  private cachedBytes = 0;
  private readonly maxDownloadBytes: number;
  private readonly maxCacheBytes: number;

  constructor(engine?: ConverseEngine, options: FileRepositoryOptions = {}) {
    this.maxDownloadBytes = options.maxDownloadBytes ?? MAX_DOWNLOAD_BYTES;
    this.maxCacheBytes = options.maxCacheBytes ?? MAX_CACHE_BYTES;
    engine?.on('disconnected', () => this.clear());
    engine?.on('logout', () => this.clear());
  }

  async fetch(attachment: Attachment): Promise<Blob> {
    const key = `${attachment.url}#${attachment.decryptionKey ?? ''}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const bytes = await download(httpsUrl(attachment.url), this.maxDownloadBytes);
    const plain =
      attachment.encryption === 'aesgcm' ? await decrypt(bytes, attachment.decryptionKey) : bytes;
    const type = DISPLAYABLE_TYPES.has(attachment.mimeType)
      ? attachment.mimeType
      : 'application/octet-stream';
    const blob = new Blob([plain], { type });
    this.remember(key, blob);
    return blob;
  }

  clear(): void {
    this.cache.clear();
    this.cachedBytes = 0;
  }

  private remember(key: string, blob: Blob): void {
    if (blob.size > this.maxCacheBytes) return;
    for (const [oldest, old] of this.cache) {
      if (this.cachedBytes + blob.size <= this.maxCacheBytes) break;
      this.cache.delete(oldest);
      this.cachedBytes -= old.size;
    }
    this.cache.set(key, blob);
    this.cachedBytes += blob.size;
  }
}

/** `aesgcm://` is HTTPS underneath (XEP-0454); plain `http:` would leak the file on the wire. */
function httpsUrl(url: string): string {
  const https = url.replace(/^aesgcm:/i, 'https:');
  if (!/^https:\/\//i.test(https)) {
    throw new DomainError('Unknown', 'Unknown: attachments are fetched over https only');
  }
  return https;
}

/**
 * The body is read as a stream and counted: `Content-Length` is only a hint, a server may lie or
 * omit it, so the connection is cancelled as soon as the bytes read exceed the cap.
 */
async function download(url: string, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'error' });
  } catch (cause) {
    throw new DomainError('Unknown', 'Unknown: the attachment could not be fetched', cause);
  }
  const tooLarge = new DomainError('Unknown', 'Unknown: the attachment is too large');
  if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw response.ok ? tooLarge : new DomainError('Unknown', `Unknown: HTTP ${response.status}`);
  }
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge;
      }
      chunks.push(value);
    }
  } catch (cause) {
    if (cause === tooLarge) throw cause;
    throw new DomainError('Unknown', 'Unknown: the attachment could not be read', cause);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function decrypt(
  bytes: Uint8Array<ArrayBuffer>,
  ivAndKey: string | undefined,
): Promise<ArrayBuffer> {
  const hex = ivAndKey ?? '';
  const ivLength = hex.length - KEY_HEX_LENGTH;
  if (!IV_HEX_LENGTHS.has(ivLength) || !/^[0-9a-f]+$/i.test(hex)) {
    throw new DomainError('Unknown', 'Unknown: malformed decryption key');
  }
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromHex(hex.slice(ivLength)),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromHex(hex.slice(0, ivLength)) },
      key,
      bytes,
    );
  } catch (cause) {
    throw new DomainError('Unknown', 'Unknown: the attachment could not be decrypted', cause);
  }
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
