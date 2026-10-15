import { type Chat, DomainError } from '@hey-postie/core';
import { useEffect, useState } from 'react';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * Whether the letters of a chat are sealed. The truth is the chat record and `chat.updated`,
 * which the service emits after a `setEncryption` it accepted: the hook never flips the state
 * itself. While the call is pending the lock is busy, and a second click does nothing.
 */
export function useEncryption(chat: Chat): {
  encrypted: boolean;
  pending: boolean;
  error: MessageKey | null;
  toggle: () => Promise<void>;
} {
  const core = useCore();
  const [encrypted, setEncrypted] = useState(chat.encrypted);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => setEncrypted(chat.encrypted), [chat.encrypted]);

  useCoreEvent('chat.updated', (updated) => {
    if (updated.id === chat.id) setEncrypted(updated.encrypted);
  });

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await core.crypto.setEncryption(chat.id, !encrypted);
    } catch (caught) {
      const noKey = caught instanceof DomainError && caught.code === 'EncryptionUnavailable';
      setError(noKey ? 'crypto.unavailable' : errorKey(caught));
    } finally {
      setPending(false);
    }
  }

  return { encrypted, pending, error, toggle };
}
