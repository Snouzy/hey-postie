import type { Presence } from '@hey-postie/core';
import { useText } from '../core/CoreProvider';
import { cn } from '../lib/cn';

const DOT_COLOR: Record<Presence, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  dnd: 'bg-red',
  offline: 'bg-ink-muted',
};

/** A small colored dot; the presence name is in the title and for screen readers. */
export function PresenceDot({ presence }: { presence: Presence }) {
  const text = useText();
  const label = text(`presence.${presence}`);
  return (
    <span
      className={cn(
        'inline-block size-[10px] shrink-0 rounded-[50%] transition-[background-color] duration-(--motion)',
        DOT_COLOR[presence],
      )}
      title={label}
      role="img"
      aria-label={label}
    />
  );
}
