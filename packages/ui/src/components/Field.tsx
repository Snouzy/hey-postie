import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from '../lib/cn';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Muted text after the input, on the same line (a hall address's `@service`). */
  suffix?: ReactNode;
}

const INPUT =
  'rounded-sm border border-line-strong bg-paper-raised px-3 py-2 text-ink transition-[border-color] duration-(--motion-fast) focus-visible:border-navy disabled:opacity-60';

/** A labelled text input. The label is always visible: placeholders alone are not enough. */
export function Field({ label, suffix, className, ...rest }: FieldProps) {
  const id = useId();
  const input = (
    <input id={id} className={cn(INPUT, suffix !== undefined && 'min-w-0 flex-1')} {...rest} />
  );
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-muted">
        {label}
      </label>
      {suffix === undefined ? (
        input
      ) : (
        <div className="flex items-center gap-2">
          {input}
          <span className="shrink-0 text-ink-muted">{suffix}</span>
        </div>
      )}
    </div>
  );
}
