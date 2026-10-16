import type { ArchiveCursor, ArchiveItem, ArchiveKind } from '@hey-postie/core';
import { useEffect, useRef, useState } from 'react';
import { useCore } from './CoreProvider';

type Status = 'loading' | 'ready' | 'error';

/**
 * The media, links or documents of a conversation (`archive.collect`), newest first: the first
 * batch on mount, the next one on `loadOlder` while the start of the archive is not reached.
 */
export function useArchive(chatId: string, kind: ArchiveKind) {
  const core = useCore();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [next, setNext] = useState<ArchiveCursor | undefined>(undefined);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  // The first batch arrived: a failure after it is the older batch's, and Retry asks for that one.
  const started = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` starts again after a failed first batch
  useEffect(() => {
    let cancelled = false;
    started.current = false;
    setItems([]);
    setNext(undefined);
    setStatus('loading');
    core.archive
      .collect(chatId, kind)
      .then((page) => {
        if (cancelled) return;
        started.current = true;
        setItems(page.items);
        setNext(page.next);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [core, chatId, kind, attempt]);

  async function loadOlder() {
    if (!next) return;
    setStatus('loading');
    try {
      const page = await core.archive.collect(chatId, kind, next);
      setItems((current) => [...current, ...page.items]);
      setNext(page.next);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  function retry() {
    if (started.current) void loadOlder();
    else setAttempt((count) => count + 1);
  }

  return { items, next, status, loadOlder, retry };
}
