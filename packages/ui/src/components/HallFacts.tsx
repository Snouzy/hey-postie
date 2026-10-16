import type { RoomVisibility } from '@hey-postie/core';
import { Check, Copy, Globe, Lock } from 'lucide-react';
import { useId, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { hallStyles } from './hallStyles';

interface HallFactsProps {
  jid: string;
  /** Unknown until the hall or its configuration says. */
  visibility: RoomVisibility | undefined;
  /** Everyone with a standing in the hall, present or away; unknown while nobody answered. */
  membersCount: number | undefined;
}

const ROW = 'flex items-center justify-between gap-2 text-[14px]';
const LABEL = 'shrink-0 text-ink-muted';

/** The "Details" rows of the hall panel: the address (with a copy button), Private or Public, members. */
export function HallFacts({ jid, visibility, membersCount }: HallFactsProps) {
  const text = useText();
  const headingId = useId();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(jid);
      setCopied(true);
    } catch {
      // No clipboard (a denied permission): the address stays selectable.
    }
  }

  const Icon = visibility === 'public' ? Globe : Lock;
  return (
    <section className="flex flex-col gap-1" aria-labelledby={headingId}>
      <h3 id={headingId} className={hallStyles.heading}>
        {text('room.details')}
      </h3>
      <dl className="m-0 flex flex-col gap-1">
        <div className={ROW}>
          <dt className={LABEL}>{text('room.address')}</dt>
          <dd className="m-0 flex min-w-0 items-center gap-1">
            <span className="truncate font-mono text-[13px] select-all" title={jid}>
              {jid}
            </span>
            <button
              type="button"
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-0 text-ink-muted hover:bg-paper-raised hover:text-ink"
              aria-label={text('room.copyAddress')}
              title={text(copied ? 'room.copied' : 'room.copyAddress')}
              onClick={() => void copy()}
            >
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            </button>
            <span className="sr-only" aria-live="polite">
              {copied ? text('room.copied') : ''}
            </span>
          </dd>
        </div>
        {visibility && (
          <div className={ROW}>
            <dt className={LABEL}>{text('room.access')}</dt>
            <dd className="m-0 flex items-center gap-1">
              <Icon size={14} aria-hidden className="text-ink-muted" />
              {text(`createRoom.${visibility}`)}
            </dd>
          </div>
        )}
        {membersCount !== undefined && (
          <div className={ROW}>
            <dt className={LABEL}>{text('room.members')}</dt>
            <dd className="m-0 tabular-nums">{membersCount}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
