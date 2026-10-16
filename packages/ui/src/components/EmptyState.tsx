import type { ReactNode } from 'react';
import { Button } from './Button';
import styles from './EmptyState.module.css';

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

/** A place with nothing in it yet: Postie, a title, one sentence, at most one button. */
export function EmptyState({
  illustration,
  title,
  sentence,
  action,
  size = 'compact',
}: EmptyStateProps) {
  return (
    <div className={`${styles.empty} ${styles[size]}`}>
      {illustration}
      <p className={styles.title}>{title}</p>
      {sentence && <p className={styles.sentence}>{sentence}</p>}
      {action && (
        <Button variant="primary" className={styles.action} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
