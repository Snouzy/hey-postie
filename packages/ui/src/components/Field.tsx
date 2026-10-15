import { type InputHTMLAttributes, useId } from 'react';
import styles from './Field.module.css';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** A labelled text input. The label is always visible: placeholders alone are not enough. */
export function Field({ label, className, ...rest }: FieldProps) {
  const id = useId();
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input id={id} className={styles.input} {...rest} />
    </div>
  );
}
