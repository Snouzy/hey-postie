import { DomainError } from '../../contracts/errors';
import type { FileRepository } from '../../contracts/repositories';
import type { Attachment } from '../../contracts/types';

/** Above this, an attachment is not downloaded at all: the UI offers the link instead. */
export const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
const CACHE_ENTRIES = 50;
/** AES-256 key (64 hex chars) after a 12 or 16-byte IV, as `plugins/omemo/utils.js` `encryptFile` writes it. */
const KEY_HEX_LENGTH = 64;
const IV_HEX_LENGTHS = new Set([24, 32]);

/**
 * Downloads attachments over HTTPS with `fetch` and decrypts `aesgcm://` ones (XEP-0454) with
 * WebCrypto: Converse uploads encrypted files but never downloads them (converse.md §7). Nothing
 * here touches the engine; the class sits with the Converse repositories because it undoes what
 * Converse's upload did. Blobs are cached by URL, bounded, for the lifetime of the process.
 */
export class ConverseFileRepository implements FileRepository {
  private readonly cache = new Map<string, Blob>();

  async fetch(attachment: Attachment): Promise<Blob> {
    const cached = this.cache.get(attachment.url);
    if (cached) return cached;
    const bytes = await download(httpsUrl(attachment.url));
    const plain =
      attachment.encryption === 'aesgcm' ? await decrypt(bytes, attachment.decryptionKey) : bytes;
    const blob = new Blob([plain], { type: attachment.mimeType || 'application/octet-stream' });
    this.remember(attachment.url, blob);
    return blob;
  }

  private remember(url: string, blob: Blob): void {
    if (this.cache.size >= CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(url, blob);
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

async function download(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'error' });
  } catch (cause) {
    throw new DomainError('Unknown', 'Unknown: the attachment could not be fetched', cause);
  }
  const announced = Number(response.headers.get('content-length'));
  if (!response.ok || announced > MAX_DOWNLOAD_BYTES) {
    controller.abort();
    const reason = response.ok ? 'the attachment is too large' : `HTTP ${response.status}`;
    throw new DomainError('Unknown', `Unknown: ${reason}`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new DomainError('Unknown', 'Unknown: the attachment is too large');
  }
  return bytes;
}

async function decrypt(bytes: ArrayBuffer, ivAndKey: string | undefined): Promise<ArrayBuffer> {
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
