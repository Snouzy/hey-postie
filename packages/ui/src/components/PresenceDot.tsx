import type { Presence } from '@hey-postie/core';
import { useText } from '../core/CoreProvider';
import styles from './PresenceDot.module.css';

/** A small colored dot; the presence name is in the title and for screen readers. */
export function PresenceDot({ presence }: { presence: Presence }) {
  const text = useText();
  const label = text(`presence.${presence}`);
  return (
    <span
      className={`${styles.dot} ${styles[presence]}`}
      title={label}
      role="img"
      aria-label={label}
    />
  );
}
