import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';

interface EmptyStateProps {
  /** Postie, in the pose that fits the place. */
  illustration?: ReactNode;
  title: string;
  /** One sentence, in Postie's voice. */
  sentence?: string;
  /** The one thing to do from here; none when there is nothing to do. */
  action?: { label: string; onClick: () => void } | undefined;
  /** `compact` for a list in the sidebar or a dialog; `full` fills a column. */
  size?: 'compact' | 'full';
}

const SIZE = {
  compact: 'px-4 py-6',
  full: 'flex-1 justify-center gap-3 p-8',
} as const;

/** A place with nothing in it yet: Postie, a title, one sentence, at most one button. */
export function EmptyState({
  illustration,
  title,
  sentence,
  action,
  size = 'compact',
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 text-center', SIZE[size])}>
      {illustration}
      <p
        className={cn(
          "m-0 max-w-[320px] font-heading text-[16px] text-ink [font-variation-settings:'SOFT'_100]",
          size === 'full' && 'text-[22px]',
        )}
      >
        {title}
      </p>
      {sentence && <p className="m-0 max-w-[320px] text-[14px] text-ink-muted">{sentence}</p>}
      {action && (
        <Button variant="primary" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
