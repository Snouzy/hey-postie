import type { FileRepository } from '../contracts/repositories';
import type { Attachment } from '../contracts/types';

/** In-memory attachments: `store(url, blob)` seeds what `fetch` returns. */
export class FakeFile implements FileRepository {
  private readonly blobs = new Map<string, Blob>();
  readonly fetched: string[] = [];

  store(url: string, blob: Blob): void {
    this.blobs.set(url, blob);
  }

  async fetch(attachment: Attachment): Promise<Blob> {
    this.fetched.push(attachment.url);
    return this.blobs.get(attachment.url) ?? new Blob([]);
  }
}
