import type { Attachment } from '@hey-postie/core';
import { useCore } from '../core/CoreProvider';
import styles from './Attachments.module.css';
import { InlineImage } from './InlineImage';
import { ParcelCard } from './ParcelCard';

export type SaveFile = (blob: Blob, name: string) => void | Promise<void>;

interface AttachmentsProps {
  attachments: Attachment[];
  onSaveFile: SaveFile;
}

/** The parcels of a message: pictures inline, everything else as a card. */
export function Attachments({ attachments, onSaveFile }: AttachmentsProps) {
  const core = useCore();
  if (attachments.length === 0) return null;
  return (
    <ul className={styles.list}>
      {attachments.map((attachment) => (
        <li key={attachment.url} className={styles.item}>
          {core.files.isInlineImage(attachment) ? (
            <InlineImage attachment={attachment} onSaveFile={onSaveFile} />
          ) : (
            <ParcelCard attachment={attachment} onSaveFile={onSaveFile} />
          )}
        </li>
      ))}
    </ul>
  );
}
