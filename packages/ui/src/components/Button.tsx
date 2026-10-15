import type { ComponentProps } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

// `ComponentProps` carries `ref`, which React 19 passes as a plain prop.
interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
}

/** The one button. `ghost` is for icon buttons in toolbars, `danger` for destructive actions. */
export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...rest} />;
}
