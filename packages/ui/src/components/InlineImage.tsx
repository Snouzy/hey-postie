import type { Attachment } from '@hey-postie/core';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useText } from '../core/CoreProvider';
import { useAttachment } from '../core/useAttachment';
import type { SaveFile } from './Attachments';
import { Lightbox } from './Lightbox';
import { RetryNotice } from './RetryNotice';

const SR_ONLY = 'absolute h-px w-px overflow-hidden [clip:rect(0_0_0_0)]';
// The parcel came sealed: a small lock on kraft at the corner.
const LOCK = 'absolute top-1 right-1 inline-flex rounded-sm bg-kraft-ink p-[2px] text-paper';

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
    return (
      <div
        className="hp-image-skeleton h-[160px] w-[240px] rounded-sm"
        role="status"
        aria-label={text('parcel.loading')}
      />
    );
  }
  return (
    <>
      <button
        type="button"
        className="relative block cursor-zoom-in overflow-hidden rounded-sm border-none bg-transparent p-0"
        aria-label={`${text('parcel.view')} ${attachment.name}`}
        onClick={() => setOpen(true)}
      >
        <img
          className="block max-h-[320px] max-w-full rounded-sm"
          src={loaded.url}
          alt={attachment.name}
        />
        {sealed && (
          <span className={LOCK} title={text('parcel.sealed')}>
            <Lock size={12} aria-hidden />
            <span className={SR_ONLY}>{text('parcel.sealed')}</span>
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
