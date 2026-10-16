import type { Message } from '@hey-postie/core';
import { useEffect, useState } from 'react';
import { useCore } from './CoreProvider';

/**
 * Whether the pictures of a letter may be fetched without a click (`files.autoLoad`: my own
 * letters, contacts in the roster): null until the service has answered, false on an error.
 * Asked only when `wanted` (the letter has something to fetch).
 */
export function useAutoLoad(message: Message, wanted: boolean): boolean | null {
  const core = useCore();
  const [auto, setAuto] = useState<boolean | null>(null);
  const { id, fromJid, direction } = message;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the answer depends on who sent the message, not on the object
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    setAuto(null);
    core.files
      .autoLoad(message)
      .then((allowed) => !cancelled && setAuto(allowed))
      .catch(() => !cancelled && setAuto(false));
    return () => {
      cancelled = true;
    };
  }, [core, id, fromJid, direction, wanted]);

  return auto;
}
