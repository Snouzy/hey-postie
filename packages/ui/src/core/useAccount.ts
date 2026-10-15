import type { Account } from '@hey-postie/core';
import { useCallback, useSyncExternalStore } from 'react';
import { useCore } from './CoreProvider';

/** The current account, re-rendered on every `account.changed` event. */
export function useAccount(): Account | null {
  const core = useCore();
  const subscribe = useCallback(
    (onChange: () => void) => core.events.on('account.changed', onChange),
    [core],
  );
  return useSyncExternalStore(subscribe, core.accounts.current, core.accounts.current);
}
