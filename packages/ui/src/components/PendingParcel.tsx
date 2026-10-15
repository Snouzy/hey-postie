import { Package, X } from 'lucide-react';
import { useLocale, useText } from '../core/CoreProvider';
import type { Upload } from '../core/useUploads';
import { formatBytes } from '../i18n/bytes';
import { Button } from './Button';
import styles from './PendingParcel.module.css';

interface PendingParcelProps {
  upload: Upload;
  onRetry: () => void;
  onDismiss: () => void;
}

/** A parcel on its way: name, weight and the progress bar; or Postie's sentence and Retry. */
export function PendingParcel({ upload, onRetry, onDismiss }: PendingParcelProps) {
  const text = useText();
  const locale = useLocale();
  const percent = Math.round(upload.progress * 100);
  const sentence =
    upload.error === 'error.FileTooLarge' && upload.limit !== null
      ? text('parcel.tooLarge').replace('{limit}', formatBytes(locale, upload.limit))
      : upload.error && text(upload.error);

  return (
    <div className={styles.bubble} data-error={upload.error !== null}>
      <div className={styles.card}>
        <Package size={24} className={styles.icon} aria-hidden />
        <div className={styles.about}>
          <span className={styles.name} title={upload.file.name}>
            {upload.file.name}
          </span>
          <span className={styles.size}>{formatBytes(locale, upload.file.size)}</span>
          {!upload.error && (
            <div
              className={styles.track}
              role="progressbar"
              aria-label={`${text('parcel.sending')} ${upload.file.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className={styles.fill} style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
      </div>
      {sentence && (
        <p className={styles.error} role="alert">
          {sentence}
          {upload.error !== 'error.FileTooLarge' && (
            <Button variant="danger" className={styles.action} onClick={onRetry}>
              {text('message.retry')}
            </Button>
          )}
          <Button
            variant="ghost"
            className={styles.action}
            onClick={onDismiss}
            aria-label={text('parcel.dismiss')}
          >
            <X size={14} aria-hidden />
          </Button>
        </p>
      )}
    </div>
  );
}
