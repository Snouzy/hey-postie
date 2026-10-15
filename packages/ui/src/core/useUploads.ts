import { DomainError, type Message } from '@hey-postie/core';
import { useRef, useState } from 'react';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';

export interface Upload {
  id: number;
  chatId: string;
  file: File;
  /** 0..1 */
  progress: number;
  error: MessageKey | null;
  /** The server's limit in bytes, known once it refused the parcel as too heavy. */
  limit: number | null;
  /** The message the service handed back; the chat's list takes it and dismisses the upload. */
  sent: Message | null;
}

/** What one chat sees of the uploads: its own, and the actions on them. */
export interface ChatUploads {
  list: Upload[];
  add: (files: File[]) => void;
  retry: (id: number) => void;
  dismiss: (id: number) => void;
}

/**
 * The parcels leaving every chat, held above the conversations so that switching chats neither
 * loses an upload in flight nor hides a refusal: each shows as a pending bubble in its chat until
 * the message lands there, or until the user dismisses the sentence.
 */
export function useUploads() {
  const core = useCore();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const nextId = useRef(0);

  function patch(id: number, changes: Partial<Upload>) {
    setUploads((current) => current.map((u) => (u.id === id ? { ...u, ...changes } : u)));
  }

  async function run(upload: Upload) {
    try {
      const sent = await core.files.send(upload.chatId, upload.file, (fraction) =>
        patch(upload.id, { progress: fraction }),
      );
      patch(upload.id, { progress: 1, sent });
    } catch (caught) {
      const tooLarge = caught instanceof DomainError && caught.code === 'FileTooLarge';
      const limit = tooLarge ? await core.files.maxFileSize().catch(() => null) : null;
      patch(upload.id, { error: errorKey(caught), limit });
    }
  }

  function add(chatId: string, files: File[]) {
    for (const file of files) {
      nextId.current += 1;
      const upload: Upload = {
        id: nextId.current,
        chatId,
        file,
        progress: 0,
        error: null,
        limit: null,
        sent: null,
      };
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

  return {
    forChat(chatId: string): ChatUploads {
      return {
        list: uploads.filter((u) => u.chatId === chatId),
        add: (files) => add(chatId, files),
        retry,
        dismiss,
      };
    },
  };
}
