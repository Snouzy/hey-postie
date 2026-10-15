import { useEffect, useId, useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { useDevices } from '../core/useDevices';
import { useTrustAction } from '../core/useTrustAction';
import { DeviceList } from './DeviceList';
import styles from './Encryption.module.css';

interface EncryptionSectionProps {
  jid: string;
  /** Opened from a sealed letter: the section takes the focus so the reader lands on it. */
  focus?: boolean;
}

/** The "Encryption" part of a contact's details: their devices, and how far each one is trusted. */
export function EncryptionSection({ jid, focus = false }: EncryptionSectionProps) {
  const text = useText();
  const headingId = useId();
  const section = useRef<HTMLElement>(null);
  const devices = useDevices(jid);
  const { error, act } = useTrustAction();

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
      {devices.length === 0 ? (
        <p className={styles.empty}>{text('crypto.empty')}</p>
      ) : (
        <>
          <p className={styles.hint}>{text('crypto.compare')}</p>
          <DeviceList
            devices={devices}
            label={text('crypto.section')}
            actions="trust"
            onAction={(device, action) => void act(device, action)}
          />
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
