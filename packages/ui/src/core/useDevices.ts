import type { Device } from '@hey-postie/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/**
 * The OMEMO devices of one address, taken from the `devices.changed` payload for that address
 * once loaded. An empty `jid` asks nothing and gives an empty list.
 */
export function useDevices(jid: string): Device[] {
  const core = useCore();
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    if (!jid) return;
    let cancelled = false;
    core.crypto
      .devices(jid)
      .then((list) => !cancelled && setDevices(list))
      .catch(() => !cancelled && setDevices([]));
    return () => {
      cancelled = true;
    };
  }, [core, jid]);

  useCoreEvent('devices.changed', (payload) => {
    if (payload.jid === jid) setDevices(payload.devices);
  });

  return devices;
}

/**
 * My own devices. The service does not say which address is mine, so every `devices.changed`
 * asks it again: the event is rare and the list short.
 */
export function useOwnDevices(): Device[] {
  const core = useCore();
  const [devices, setDevices] = useState<Device[]>([]);
  // Responses can come back out of order; only the latest request may set the list.
  const requests = useRef(0);
  const refresh = useCallback(async () => {
    requests.current += 1;
    const mine = requests.current;
    try {
      const list = await core.crypto.ownDevices();
      if (mine === requests.current) setDevices(list);
    } catch {
      if (mine === requests.current) setDevices([]);
    }
  }, [core]);

  useEffect(() => void refresh(), [refresh]);
  useCoreEvent('devices.changed', () => void refresh());

  return devices;
}
