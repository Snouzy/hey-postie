import type { Device } from '@hey-postie/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

export interface DevicesState {
  devices: Device[];
  /** The load failed: Postie's sentence, and `reload` to try again. Never shown as "no key". */
  error: MessageKey | null;
  reload: () => void;
}

/**
 * The OMEMO devices of one address. Loaded once per address, then taken from the
 * `devices.changed` payload for that address, which also wins over a load still in flight.
 * An empty `jid` (no peer) asks nothing and gives an empty list.
 */
export function useDevices(jid: string): DevicesState {
  const core = useCore();
  const load = useCallback(() => core.crypto.devices(jid), [core, jid]);
  return useLoadedDevices(load, jid === '', (payload) =>
    payload.jid === jid ? payload.devices : null,
  );
}

/**
 * My own devices. The service does not say which address is mine, so every `devices.changed`
 * asks it again: the event is rare and the list short.
 */
export function useOwnDevices(): DevicesState {
  const core = useCore();
  const load = useCallback(() => core.crypto.ownDevices(), [core]);
  return useLoadedDevices(load, false, () => 'reload');
}

type OnChanged = (payload: { jid: string; devices: Device[] }) => Device[] | 'reload' | null;

/**
 * Shared loading rules: a new `load` (a new address) empties the list at once; only the latest
 * request may set it; `onChanged` says what a `devices.changed` means here: a fresh list (which
 * cancels a load still in flight), a reason to load again, or nothing.
 */
function useLoadedDevices(
  load: () => Promise<Device[]>,
  idle: boolean,
  onChanged: OnChanged,
): DevicesState {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<MessageKey | null>(null);
  const requests = useRef(0);

  const reload = useCallback(() => {
    if (idle) return;
    requests.current += 1;
    const mine = requests.current;
    setError(null);
    load()
      .then((list) => mine === requests.current && setDevices(list))
      .catch((caught: unknown) => mine === requests.current && setError(errorKey(caught)));
  }, [load, idle]);

  useEffect(() => {
    setDevices([]);
    setError(null);
    reload();
  }, [reload]);

  useCoreEvent('devices.changed', (payload) => {
    const outcome = onChanged(payload);
    if (outcome === null) return;
    if (outcome === 'reload') return reload();
    requests.current += 1;
    setError(null);
    setDevices(outcome);
  });

  return { devices, error, reload };
}
