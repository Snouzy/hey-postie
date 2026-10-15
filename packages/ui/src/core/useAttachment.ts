import type { Attachment } from '@hey-postie/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';

type State =
  | { status: 'loading' }
  | { status: 'ready'; blob: Blob; url: string }
  | { status: 'error'; error: MessageKey };

/**
 * The bytes of an attachment, through `files.fetch` (which decrypts an `aesgcm` parcel), as an
 * object URL the `<img>` can show. The raw URL never reaches the DOM: the webview must not fetch
 * arbitrary hosts, and a sealed parcel would be garbage anyway. The URL is revoked on unmount.
 * Keyed by what identifies the bytes, not by the object: a message updated (a reaction) brings a
 * new `Attachment` object for the same parcel, and must not fetch it again.
 */
export function useAttachment(attachment: Attachment): State & { retry: () => void } {
  const core = useCore();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(attachment);
  latest.current = attachment;
  const { url: source, encryption, decryptionKey } = attachment;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the bytes depend on these three fields only; `attempt` re-runs the fetch on Retry
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setState({ status: 'loading' });
    core.files
      .fetch(latest.current)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ status: 'ready', blob, url });
      })
      .catch(
        (caught: unknown) => !cancelled && setState({ status: 'error', error: errorKey(caught) }),
      );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [core, source, encryption, decryptionKey, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { ...state, retry };
}
