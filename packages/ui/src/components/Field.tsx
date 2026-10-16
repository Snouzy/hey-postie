import { type InputHTMLAttributes, useId } from 'react';
import { cn } from '../lib/cn';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const INPUT =
  'rounded-sm border border-line-strong bg-paper-raised px-3 py-2 text-ink transition-[border-color] duration-(--motion-fast) focus-visible:border-navy disabled:opacity-60';

/** A labelled text input. The label is always visible: placeholders alone are not enough. */
export function Field({ label, className, ...rest }: FieldProps) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-muted">
        {label}
      </label>
      <input id={id} className={INPUT} {...rest} />
    </div>
  );
}
