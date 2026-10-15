import type { Device } from '@hey-postie/core';
import { useCore, useText } from '../core/CoreProvider';
import { Button } from './Button';
import styles from './DeviceList.module.css';

export type DeviceAction = 'verify' | 'block' | 'unblock' | 'remove';

interface DeviceListProps {
  devices: Device[];
  label: string;
  /** `trust`: Verify / Block / Unblock on a contact's devices. `remove`: on my own. */
  actions: 'trust' | 'remove';
  onAction: (device: Device, action: DeviceAction) => void;
  /** Among my own devices, the one I am on: marked, and not removable from itself. */
  thisDeviceId?: number | undefined;
}

/**
 * One row per device: the fingerprint as the user compares it, the trust as a stamp, and the
 * actions. Each button carries the fingerprint in its accessible name, since the rows look alike.
 */
export function DeviceList({ devices, label, actions, onAction, thisDeviceId }: DeviceListProps) {
  const core = useCore();
  const text = useText();

  return (
    <ul className={styles.list} aria-label={label}>
      {devices.map((device) => {
        const fingerprint = core.crypto.formatFingerprint(device.fingerprint);
        const mine = device.deviceId === thisDeviceId;
        const available: DeviceAction[] =
          actions === 'trust' ? trustActions(device) : mine ? [] : ['remove'];
        return (
          <li key={device.deviceId} className={styles.device}>
            <code className={styles.fingerprint}>{fingerprint}</code>
            <div className={styles.row}>
              {actions === 'trust' && (
                <span className={styles.stamp} data-trust={device.trust}>
                  {text(`crypto.trust.${device.trust}`)}
                </span>
              )}
              {mine && (
                <span className={styles.stamp} data-trust="verified">
                  {text('crypto.thisDevice')}
                </span>
              )}
              <span className={styles.actions}>
                {available.map((action) => (
                  <Button
                    key={action}
                    variant={action === 'verify' ? 'secondary' : 'danger'}
                    className={styles.action}
                    aria-label={`${text(`crypto.${action}`)} ${fingerprint}`}
                    onClick={() => onAction(device, action)}
                  >
                    {text(`crypto.${action}`)}
                  </Button>
                ))}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function trustActions(device: Device): DeviceAction[] {
  if (device.trust === 'blocked') return ['unblock'];
  if (device.trust === 'verified') return ['block'];
  return ['verify', 'block'];
}
