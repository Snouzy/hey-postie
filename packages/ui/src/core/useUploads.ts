import { DomainError, type Message } from '@hey-postie/core';
import { useRef, useState } from 'react';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';

export interface Upload {
  id: number;
  file: File;
  /** 0..1 */
  progress: number;
  error: MessageKey | null;
  /** The server's limit in bytes, known once it refused the parcel as too heavy. */
  limit: number | null;
}

/**
 * The parcels leaving the open chat. Each one shows as a pending bubble until the service hands
 * back the message, which `onSent` puts in the list; a refusal keeps the bubble with the sentence
 * and a way to retry.
 */
export function useUploads(chatId: string, onSent: (message: Message) => void) {
  const core = useCore();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const nextId = useRef(0);

  function patch(id: number, changes: Partial<Upload>) {
    setUploads((current) => current.map((u) => (u.id === id ? { ...u, ...changes } : u)));
  }

  async function run(upload: Upload) {
    try {
      const sent = await core.files.send(chatId, upload.file, (fraction) =>
        patch(upload.id, { progress: fraction }),
      );
      setUploads((current) => current.filter((u) => u.id !== upload.id));
      onSent(sent);
    } catch (caught) {
      const tooLarge = caught instanceof DomainError && caught.code === 'FileTooLarge';
      const limit = tooLarge ? await core.files.maxFileSize().catch(() => null) : null;
      patch(upload.id, { error: errorKey(caught), limit });
    }
  }

  function add(files: File[]) {
    for (const file of files) {
      nextId.current += 1;
      const upload: Upload = { id: nextId.current, file, progress: 0, error: null, limit: null };
      setUploads((current) => [...current, upload]);
      void run(upload);
    }
  }

  function retry(id: number) {
    const upload = uploads.find((u) => u.id === id);
    if (!upload) return;
    patch(id, { progress: 0, error: null, limit: null });
    void run(upload);
  }

  function dismiss(id: number) {
    setUploads((current) => current.filter((u) => u.id !== id));
  }

  return { uploads, add, retry, dismiss };
}
