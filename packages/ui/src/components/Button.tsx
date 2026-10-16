import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

const button = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-transparent px-4 py-2 leading-[1.3] font-semibold transition-[background-color,color,opacity] duration-(--motion-fast) disabled:cursor-default disabled:opacity-55',
  {
    variants: {
      variant: {
        primary: 'border-navy bg-navy text-navy-contrast',
        secondary: 'border-navy bg-transparent text-navy',
        ghost:
          'rounded-sm bg-transparent p-2 text-ink-muted enabled:hover:bg-paper-raised enabled:hover:text-ink',
        danger: 'border-red bg-transparent text-red',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

// `ComponentProps` carries `ref`, which React 19 passes as a plain prop.
interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof button> {}

/** The one button. `ghost` is for icon buttons in toolbars, `danger` for destructive actions. */
export function Button({ variant, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cn(button({ variant }), className)} {...rest} />;
}
