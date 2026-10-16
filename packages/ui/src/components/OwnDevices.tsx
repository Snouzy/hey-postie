import type { Device } from '@hey-postie/core';
import { useEffect, useRef, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useOwnDevices } from '../core/useDevices';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { DeviceList } from './DeviceList';
import styles from './OwnDevices.module.css';
import { RetryNotice } from './RetryNotice';

interface OwnDevicesProps {
  /** States this device's fingerprint in a sentence above the list (the settings window). */
  withFingerprint?: boolean;
}

/**
 * My own keys, one per device, with "Remove". The confirmation replaces the list in place rather
 * than opening a dialog, so Esc has a single card to close. Focus follows: the confirm button when
 * asked, the row's "Remove" on cancel, the list after a removal. Shown inside the `MyDevices`
 * dialog and in the Privacy section of the settings window.
 */
export function OwnDevices({ withFingerprint = false }: OwnDevicesProps) {
  const core = useCore();
  const text = useText();
  const { devices, error: loadError, reload } = useOwnDevices();
  const [removing, setRemoving] = useState<Device | null>(null);
  const [thisDeviceId, setThisDeviceId] = useState<number | undefined>(undefined);
  const [error, setError] = useState<MessageKey | null>(null);
  const busy = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  // Where the focus goes once the list is back: a row's "Remove" (cancel) or the list (removed).
  const returnTo = useRef<number | 'list' | null>(null);
  const thisDevice = devices.find((device) => device.deviceId === thisDeviceId);

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

  // The device went away from elsewhere while its removal was being confirmed.
  useEffect(() => {
    if (removing && !devices.some((device) => device.deviceId === removing.deviceId)) {
      returnTo.current = 'list';
      setRemoving(null);
    }
  }, [devices, removing]);

  useEffect(() => {
    if (removing) return confirm.current?.focus();
    const target = returnTo.current;
    returnTo.current = null;
    if (target === 'list') body.current?.focus();
    else if (target !== null) {
      body.current?.querySelector<HTMLElement>(`[data-device="${target}"] button`)?.focus();
    }
  }, [removing]);

  function cancel() {
    returnTo.current = removing?.deviceId ?? null;
    setRemoving(null);
  }

  async function remove(device: Device) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      await core.crypto.removeOwnDevice(device.deviceId);
      returnTo.current = 'list';
    } catch (caught) {
      setError(errorKey(caught));
      returnTo.current = device.deviceId;
    } finally {
      busy.current = false;
      setRemoving(null);
    }
  }

  return (
    <>
      {removing ? (
        <>
          <p className={styles.confirm}>{text('crypto.confirmRemove')}</p>
          <code className={styles.fingerprint}>
            {core.crypto.formatFingerprint(removing.fingerprint)}
          </code>
          <div className={styles.actions}>
            <Button onClick={cancel}>{text('dialog.cancel')}</Button>
            <Button ref={confirm} variant="danger" onClick={() => void remove(removing)}>
              {text('crypto.remove')}
            </Button>
          </div>
        </>
      ) : (
        <div ref={body} className={styles.body} tabIndex={-1}>
          {withFingerprint && thisDevice && (
            <p className={styles.thisDevice}>
              {text('settings.privacy.thisFingerprint')}
              <code className={styles.fingerprint}>
                {core.crypto.formatFingerprint(thisDevice.fingerprint)}
              </code>
            </p>
          )}
          <p className={styles.hint}>{text('crypto.myDevicesHint')}</p>
          {loadError ? (
            <RetryNotice error={loadError} onRetry={reload} />
          ) : devices.length === 0 ? (
            <p className={styles.empty}>{text('crypto.myDevicesEmpty')}</p>
          ) : (
            <DeviceList
              devices={devices}
              label={text('crypto.myDevices')}
              actions="remove"
              thisDeviceId={thisDeviceId}
              onAction={async (device) => setRemoving(device)}
            />
          )}
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
    </>
  );
}
