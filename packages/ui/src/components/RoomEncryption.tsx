import type { Device, RoomMember } from '@hey-postie/core';
import { useEffect, useId, useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { useDevices } from '../core/useDevices';
import { useTrustAction } from '../core/useTrustAction';
import { type DeviceAction, DeviceList } from './DeviceList';
import styles from './Encryption.module.css';

interface RoomEncryptionProps {
  members: RoomMember[];
  /** Opened from a sealed letter: the section takes the focus so the reader lands on it. */
  focus?: boolean;
}

/**
 * The "Encryption" part of a hall's details: the devices of the members whose address the hall
 * reveals, grouped by member. Anonymous members have no address, so nothing to check.
 */
export function RoomEncryption({ members, focus = false }: RoomEncryptionProps) {
  const text = useText();
  const headingId = useId();
  const section = useRef<HTMLElement>(null);
  const { error, act } = useTrustAction();
  const known = members.filter((member): member is RoomMember & { jid: string } => !!member.jid);

  useEffect(() => {
    if (!focus) return;
    section.current?.focus();
    section.current?.scrollIntoView?.({ block: 'start' });
  }, [focus]);

  return (
    <section ref={section} className={styles.section} aria-labelledby={headingId} tabIndex={-1}>
      <h3 id={headingId} className={styles.heading}>
        {text('crypto.section')}
      </h3>
      {known.length === 0 ? (
        <p className={styles.empty}>{text('crypto.roomEmpty')}</p>
      ) : (
        <>
          <p className={styles.hint}>{text('crypto.compare')}</p>
          {known.map((member) => (
            <MemberDevices
              key={member.jid}
              member={member}
              onAction={(device, action) => void act(device, action)}
            />
          ))}
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
    </section>
  );
}

interface MemberDevicesProps {
  member: RoomMember & { jid: string };
  onAction: (device: Device, action: DeviceAction) => void;
}

/** One member's devices; a member without any known device takes no room. */
function MemberDevices({ member, onAction }: MemberDevicesProps) {
  const devices = useDevices(member.jid);
  if (devices.length === 0) return null;
  return (
    <div>
      <h4 className={styles.member}>{member.nick}</h4>
      <DeviceList devices={devices} label={member.nick} actions="trust" onAction={onAction} />
    </div>
  );
}
