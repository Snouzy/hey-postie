import type { Device } from '@hey-postie/core';
import { useState } from 'react';
import type { DeviceAction } from '../components/DeviceList';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';

/** Verify, block or unblock a contact's device; the list itself follows `devices.changed`. */
export function useTrustAction(): {
  error: MessageKey | null;
  act: (device: Device, action: DeviceAction) => Promise<void>;
} {
  const core = useCore();
  const [error, setError] = useState<MessageKey | null>(null);

  async function act(device: Device, action: DeviceAction) {
    setError(null);
    try {
      if (action === 'verify') await core.crypto.verify(device.jid, device.deviceId);
      else if (action === 'block') await core.crypto.block(device.jid, device.deviceId);
      else if (action === 'unblock') await core.crypto.unblock(device.jid, device.deviceId);
    } catch (caught) {
      setError(errorKey(caught));
    }
  }

  return { error, act };
}
