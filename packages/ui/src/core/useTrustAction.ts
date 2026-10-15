import type { Device } from '@hey-postie/core';
import { useRef, useState } from 'react';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';

/** What a device row can do: trust actions on a contact's device, removal on my own. */
export type DeviceAction = 'verify' | 'block' | 'unblock' | 'remove';

/**
 * Verify, block or unblock a contact's device; the list itself follows `devices.changed`. One
 * call at a time: a second click while the first is in flight does nothing.
 */
export function useTrustAction(): {
  error: MessageKey | null;
  act: (device: Device, action: DeviceAction) => Promise<void>;
} {
  const core = useCore();
  const [error, setError] = useState<MessageKey | null>(null);
  const busy = useRef(false);

  async function act(device: Device, action: DeviceAction) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      if (action === 'verify') await core.crypto.verify(device.jid, device.deviceId);
      else if (action === 'block') await core.crypto.block(device.jid, device.deviceId);
      else if (action === 'unblock') await core.crypto.unblock(device.jid, device.deviceId);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      busy.current = false;
    }
  }

  return { error, act };
}
