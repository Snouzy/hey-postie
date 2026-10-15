import type { CoreEvents } from '@hey-postie/core';
import { useEffect, useRef } from 'react';
import { useCore } from './CoreProvider';

/**
 * Runs `handler` on every `event` from the core. The latest handler is always the one called,
 * so callers need not memoize it; the subscription itself lives as long as the component.
 */
export function useCoreEvent<K extends keyof CoreEvents>(
  event: K,
  handler: (payload: CoreEvents[K]) => void,
): void {
  const core = useCore();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => core.events.on(event, (payload) => latest.current(payload)), [core, event]);
}
