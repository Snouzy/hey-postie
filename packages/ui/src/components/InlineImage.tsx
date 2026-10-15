import type { Attachment } from '@hey-postie/core';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useText } from '../core/CoreProvider';
import { useAttachment } from '../core/useAttachment';
import type { SaveFile } from './Attachments';
import styles from './InlineImage.module.css';
import { Lightbox } from './Lightbox';
import { RetryNotice } from './RetryNotice';

interface InlineImageProps {
  attachment: Attachment;
  onSaveFile: SaveFile;
}

/**
 * A picture shown in the bubble, fetched (and decrypted) through the service. A skeleton while
 * it loads, Postie's sentence with Retry when it fails, a lightbox on click.
 */
export function InlineImage({ attachment, onSaveFile }: InlineImageProps) {
  const text = useText();
  const loaded = useAttachment(attachment);
  const [open, setOpen] = useState(false);
  const sealed = attachment.encryption === 'aesgcm';

  if (loaded.status === 'error') {
    return <RetryNotice error="parcel.fetchFailed" onRetry={loaded.retry} />;
  }
  if (loaded.status === 'loading') {
    return <div className={styles.skeleton} role="status" aria-label={text('parcel.loading')} />;
  }
  return (
    <>
      <button
        type="button"
        className={styles.frame}
        aria-label={`${text('parcel.view')} ${attachment.name}`}
        onClick={() => setOpen(true)}
      >
        <img className={styles.image} src={loaded.url} alt={attachment.name} />
        {sealed && (
          <span className={styles.lock} title={text('parcel.sealed')}>
            <Lock size={12} aria-hidden />
            <span className={styles.srOnly}>{text('parcel.sealed')}</span>
          </span>
        )}
      </button>
      {open && (
        <Lightbox
          name={attachment.name}
          url={loaded.url}
          onSave={() => onSaveFile(loaded.blob, attachment.name)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
