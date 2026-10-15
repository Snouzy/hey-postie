import type { Device } from '@hey-postie/core';
import { useId, useRef } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { DeviceAction } from '../core/useTrustAction';
import { Button } from './Button';
import styles from './DeviceList.module.css';

interface DeviceListProps {
  devices: Device[];
  label: string;
  /** `trust`: Verify / Block / Unblock on a contact's devices. `remove`: on my own. */
  actions: 'trust' | 'remove';
  /** Resolves once the service answered; the row then takes the focus, as its buttons change. */
  onAction: (device: Device, action: DeviceAction) => Promise<void>;
  /** Among my own devices, the one I am on: marked, and not removable from itself. */
  thisDeviceId?: number | undefined;
}

/**
 * One row per device: the fingerprint as the user compares it, the trust as a stamp, and the
 * actions. Each button is described by its row's fingerprint, since the rows look alike.
 */
export function DeviceList({ devices, label, actions, onAction, thisDeviceId }: DeviceListProps) {
  const core = useCore();
  const text = useText();
  const prefix = useId();
  const rows = useRef(new Map<number, HTMLLIElement>());

  async function act(device: Device, action: DeviceAction) {
    await onAction(device, action);
    rows.current.get(device.deviceId)?.focus();
  }

  return (
    <ul className={styles.list} aria-label={label}>
      {devices.map((device) => {
        const fingerprint = core.crypto.formatFingerprint(device.fingerprint);
        const codeId = `${prefix}-${device.deviceId}`;
        const mine = device.deviceId === thisDeviceId;
        const available: DeviceAction[] =
          actions === 'trust' ? trustActions(device) : mine ? [] : ['remove'];
        return (
          <li
            key={device.deviceId}
            ref={(element) => {
              if (element) rows.current.set(device.deviceId, element);
              else rows.current.delete(device.deviceId);
            }}
            className={styles.device}
            data-device={device.deviceId}
            tabIndex={-1}
          >
            <code id={codeId} className={styles.fingerprint}>
              {fingerprint}
            </code>
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
                    aria-describedby={codeId}
                    onClick={() => void act(device, action)}
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
