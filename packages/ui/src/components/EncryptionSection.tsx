import { useEffect, useId, useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { useDevices } from '../core/useDevices';
import { useTrustAction } from '../core/useTrustAction';
import { DeviceList } from './DeviceList';
import styles from './Encryption.module.css';
import { RetryNotice } from './RetryNotice';

interface EncryptionSectionProps {
  jid: string;
  /** Counts the "Check their devices" requests: every new one sends the focus to the section. */
  focusRequest?: number;
}

/** The "Encryption" part of a contact's details: their devices, and how far each one is trusted. */
export function EncryptionSection({ jid, focusRequest = 0 }: EncryptionSectionProps) {
  const text = useText();
  const headingId = useId();
  const section = useRef<HTMLElement>(null);
  const { devices, error, reload } = useDevices(jid);
  const trust = useTrustAction();

  useEffect(() => {
    if (focusRequest === 0) return;
    section.current?.focus();
    section.current?.scrollIntoView?.({ block: 'start' });
  }, [focusRequest]);

  return (
    <section ref={section} className={styles.section} aria-labelledby={headingId} tabIndex={-1}>
      <h3 id={headingId} className={styles.heading}>
        {text('crypto.section')}
      </h3>
      {error ? (
        <RetryNotice error={error} onRetry={reload} />
      ) : devices.length === 0 ? (
        <p className={styles.empty}>{text('crypto.empty')}</p>
      ) : (
        <>
          <p className={styles.hint}>{text('crypto.compare')}</p>
          <DeviceList
            devices={devices}
            label={text('crypto.section')}
            actions="trust"
            onAction={trust.act}
          />
        </>
      )}
      {trust.error && (
        <p className={styles.error} role="alert">
          {text(trust.error)}
        </p>
      )}
    </section>
  );
}
