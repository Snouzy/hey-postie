import type { Device } from '@hey-postie/core';
import { useId, useRef } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { DeviceAction } from '../core/useTrustAction';
import { Button } from './Button';

/** The trust stamp: a small inked rectangle, its color says the state. */
const STAMP =
  'shrink-0 rounded-sm border border-current px-2 py-px text-[11px] font-bold tracking-[0.04em] text-ink-muted uppercase data-[trust=blocked]:text-red data-[trust=trusted]:text-navy data-[trust=verified]:text-success';

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
    <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={label}>
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
            className="flex flex-col gap-1"
            data-device={device.deviceId}
            tabIndex={-1}
          >
            {/* Groups of eight, as the user reads them aloud on the phone. */}
            <code id={codeId} className="font-mono text-[12px] wrap-anywhere">
              {fingerprint}
            </code>
            <div className="flex items-center justify-between gap-2">
              {actions === 'trust' && (
                <span className={STAMP} data-trust={device.trust}>
                  {text(`crypto.trust.${device.trust}`)}
                </span>
              )}
              {mine && (
                <span className={STAMP} data-trust="verified">
                  {text('crypto.thisDevice')}
                </span>
              )}
              <span className="flex gap-1">
                {available.map((action) => (
                  <Button
                    key={action}
                    variant={action === 'verify' ? 'secondary' : 'danger'}
                    // `leading` again: cn drops the button's line height when the font size changes.
                    className="px-3 py-[2px] text-[13px] leading-[1.3]"
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
