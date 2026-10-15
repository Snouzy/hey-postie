import type { Device } from '@hey-postie/core';
import { useEffect, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useOwnDevices } from '../core/useDevices';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { DeviceList } from './DeviceList';
import { Dialog } from './Dialog';
import styles from './MyDevices.module.css';

interface MyDevicesProps {
  onClose: () => void;
}

/**
 * My own keys, one per device, with "Remove". The confirmation replaces the list inside the same
 * dialog rather than opening a second one, so Esc has a single card to close.
 */
export function MyDevices({ onClose }: MyDevicesProps) {
  const core = useCore();
  const text = useText();
  const devices = useOwnDevices();
  const [removing, setRemoving] = useState<Device | null>(null);
  const [thisDeviceId, setThisDeviceId] = useState<number | undefined>(undefined);
  const [error, setError] = useState<MessageKey | null>(null);

  // Unknown until the service answers: no row is marked in the meantime.
  useEffect(() => {
    let cancelled = false;
    core.crypto
      .ownDeviceId()
      .then((id) => !cancelled && setThisDeviceId(id))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [core]);

  async function remove(device: Device) {
    setError(null);
    try {
      await core.crypto.removeOwnDevice(device.deviceId);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Dialog title={text('crypto.myDevices')} onClose={onClose}>
      {removing ? (
        <>
          <p className={styles.confirm}>{text('crypto.confirmRemove')}</p>
          <code className={styles.fingerprint}>
            {core.crypto.formatFingerprint(removing.fingerprint)}
          </code>
          <div className={styles.actions}>
            <Button onClick={() => setRemoving(null)}>{text('dialog.cancel')}</Button>
            <Button variant="danger" onClick={() => void remove(removing)}>
              {text('crypto.remove')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.hint}>{text('crypto.myDevicesHint')}</p>
          {devices.length === 0 ? (
            <p className={styles.empty}>{text('crypto.myDevicesEmpty')}</p>
          ) : (
            <DeviceList
              devices={devices}
              label={text('crypto.myDevices')}
              actions="remove"
              thisDeviceId={thisDeviceId}
              onAction={(device) => setRemoving(device)}
            />
          )}
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
    </Dialog>
  );
}
