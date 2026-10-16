import { useEffect, useId, useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { useDevices } from '../core/useDevices';
import { useTrustAction } from '../core/useTrustAction';
import { DeviceList } from './DeviceList';
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
    // 'nearest': the pane scrolls to the section; nothing above the pane moves.
    section.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusRequest]);

  return (
    <section
      ref={section}
      className="flex flex-col gap-2 focus-visible:outline-offset-(--space-1)"
      aria-labelledby={headingId}
      tabIndex={-1}
    >
      <h3
        id={headingId}
        className="m-0 font-text text-[12px] font-bold tracking-[0.04em] uppercase text-ink-muted"
      >
        {text('crypto.section')}
      </h3>
      {error ? (
        <RetryNotice error={error} onRetry={reload} />
      ) : devices.length === 0 ? (
        // Postie's words: no key to show, in his voice.
        <p className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-ink-muted">
          {text('crypto.empty')}
        </p>
      ) : (
        <>
          <p className="m-0 text-[13px] text-ink-muted">{text('crypto.compare')}</p>
          <DeviceList
            devices={devices}
            label={text('crypto.section')}
            actions="trust"
            onAction={trust.act}
          />
        </>
      )}
      {trust.error && (
        <p className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-red" role="alert">
          {text(trust.error)}
        </p>
      )}
    </section>
  );
}
