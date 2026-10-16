import type { RoomMember } from '@hey-postie/core';
import { useEffect, useId, useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { useMemberDevices } from '../core/useMemberDevices';
import { useTrustAction } from '../core/useTrustAction';
import { DeviceList } from './DeviceList';
import { RetryNotice } from './RetryNotice';

interface RoomEncryptionProps {
  members: RoomMember[];
  /** Counts the "Check their devices" requests: every new one sends the focus to the section. */
  focusRequest?: number;
}

/**
 * The "Encryption" part of a hall's details: the devices of the members whose address the hall
 * reveals, grouped by member. Anonymous members have no address, so nothing to check.
 */
export function RoomEncryption({ members, focusRequest = 0 }: RoomEncryptionProps) {
  const text = useText();
  const headingId = useId();
  const section = useRef<HTMLElement>(null);
  const trust = useTrustAction();
  const known = members.filter((member): member is RoomMember & { jid: string } => !!member.jid);
  const { byJid, loaded, error, reload } = useMemberDevices(known.map((member) => member.jid));
  const withDevices = known.filter((member) => (byJid.get(member.jid)?.length ?? 0) > 0);

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
      ) : loaded && withDevices.length === 0 ? (
        // Postie's words: no key to show, in his voice.
        <p className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-ink-muted">
          {text('crypto.roomEmpty')}
        </p>
      ) : (
        withDevices.length > 0 && (
          <>
            <p className="m-0 text-[13px] text-ink-muted">{text('crypto.compare')}</p>
            {withDevices.map((member) => (
              <div key={member.jid}>
                <h4 className="mx-0 mt-2 mb-1 text-[13px] font-semibold wrap-anywhere">
                  {member.nick}
                </h4>
                <DeviceList
                  devices={byJid.get(member.jid) ?? []}
                  label={member.nick}
                  actions="trust"
                  onAction={trust.act}
                />
              </div>
            ))}
          </>
        )
      )}
      {trust.error && (
        <p className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-red" role="alert">
          {text(trust.error)}
        </p>
      )}
    </section>
  );
}
