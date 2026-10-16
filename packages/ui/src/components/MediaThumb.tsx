import type { Attachment } from '@hey-postie/core';
import { RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useText } from '../core/CoreProvider';
import { useAttachment } from '../core/useAttachment';
import type { SaveFile } from './Attachments';
import { Lightbox } from './Lightbox';

const TILE = 'flex size-full cursor-pointer items-center justify-center border-none p-0';

interface MediaThumbProps {
  attachment: Attachment;
  onSaveFile: SaveFile;
  onShowInChat: () => void;
}

/**
 * A picture of the archive, fetched (and decrypted) through the service like the one in the
 * letter, cropped to its square; a click opens the image viewer.
 */
export function MediaThumb({ attachment, onSaveFile, onShowInChat }: MediaThumbProps) {
  const text = useText();
  const loaded = useAttachment(attachment);
  const [open, setOpen] = useState(false);

  if (loaded.status === 'loading') {
    return (
      <div
        className="hp-image-skeleton size-full"
        role="status"
        aria-label={text('parcel.loading')}
      />
    );
  }
  if (loaded.status === 'error') {
    return (
      <button
        type="button"
        className={`${TILE} bg-kraft-soft text-red`}
        onClick={loaded.retry}
        aria-label={`${text('parcel.fetchFailed')} ${text('message.retry')}`}
        title={text('parcel.fetchFailed')}
      >
        <RotateCw size={20} aria-hidden />
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`${TILE} cursor-zoom-in bg-transparent`}
        aria-label={`${text('parcel.view')} ${attachment.name}`}
        onClick={() => setOpen(true)}
      >
        <img className="size-full object-cover" src={loaded.url} alt={attachment.name} />
      </button>
      {open && (
        <Lightbox
          name={attachment.name}
          url={loaded.url}
          onSave={() => onSaveFile(loaded.blob, attachment.name)}
          onClose={() => setOpen(false)}
          onShowInChat={onShowInChat}
        />
      )}
    </>
  );
}
