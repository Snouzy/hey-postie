import { type Chat, DomainError } from '@hey-postie/core';
import { useState } from 'react';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * Whether the letters of a chat are sealed. Starts from the chat record, follows `chat.updated`,
 * and flips after a `setEncryption` the service accepted. The caller is keyed by the chat, so the
 * initial value is read once per chat.
 */
export function useEncryption(chat: Chat): {
  encrypted: boolean;
  error: MessageKey | null;
  toggle: () => Promise<void>;
} {
  const core = useCore();
  const [encrypted, setEncrypted] = useState(chat.encrypted);
  const [error, setError] = useState<MessageKey | null>(null);

  useCoreEvent('chat.updated', (updated) => {
    if (updated.id === chat.id) setEncrypted(updated.encrypted);
  });

  async function toggle() {
    setError(null);
    try {
      await core.crypto.setEncryption(chat.id, !encrypted);
      setEncrypted(!encrypted);
    } catch (caught) {
      const noKey = caught instanceof DomainError && caught.code === 'EncryptionUnavailable';
      setError(noKey ? 'crypto.unavailable' : errorKey(caught));
    }
  }

  return { encrypted, error, toggle };
}
