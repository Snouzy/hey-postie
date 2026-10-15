import { useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { Button } from './Button';
import styles from './RetryNotice.module.css';

interface RetryNoticeProps {
  error: MessageKey;
  onRetry: () => void;
}

/** A load that failed: Postie's sentence and a way to ask again. Never mistaken for "nothing". */
export function RetryNotice({ error, onRetry }: RetryNoticeProps) {
  const text = useText();
  return (
    <p className={styles.notice} role="alert">
      {text(error)}
      <Button className={styles.retry} onClick={onRetry}>
        {text('message.retry')}
      </Button>
    </p>
  );
}
