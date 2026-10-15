import type { Attachment, Message } from '@hey-postie/core';
import { useEffect, useState } from 'react';
import { useCore } from '../core/CoreProvider';
import styles from './Attachments.module.css';
import { InlineImage } from './InlineImage';
import { ParcelCard } from './ParcelCard';

export type SaveFile = (blob: Blob, name: string) => void;

interface AttachmentsProps {
  message: Message;
  onSaveFile: SaveFile;
}

/**
 * The parcels of a message: pictures inline, everything else as a card. A picture is fetched
 * without a click only when the service allows it (`files.autoLoad`: our own letters, contacts
 * in the roster); from anyone else it waits as a card with "Load image", so that a stranger's URL
 * never tells them when the chat was opened. Nothing shows until the service has answered.
 */
export function Attachments({ message, onSaveFile }: AttachmentsProps) {
  const core = useCore();
  const [auto, setAuto] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const { id, fromJid, direction, attachments } = message;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the answer depends on who sent the message, not on the object
  useEffect(() => {
    if (attachments.length === 0) return;
    let cancelled = false;
    setAuto(null);
    core.files
      .autoLoad(message)
      .then((allowed) => !cancelled && setAuto(allowed))
      .catch(() => !cancelled && setAuto(false));
    return () => {
      cancelled = true;
    };
  }, [core, id, fromJid, direction, attachments.length]);

  if (attachments.length === 0 || auto === null) return null;

  function inline(attachment: Attachment): boolean {
    return core.files.isInlineImage(attachment) && (auto === true || loaded.has(attachment.url));
  }

  return (
    <ul className={styles.list}>
      {attachments.map((attachment) => (
        <li key={attachment.url} className={styles.item}>
          {inline(attachment) ? (
            <InlineImage attachment={attachment} onSaveFile={onSaveFile} />
          ) : (
            <ParcelCard
              attachment={attachment}
              onSaveFile={onSaveFile}
              onLoad={
                core.files.isInlineImage(attachment)
                  ? () => setLoaded((current) => new Set(current).add(attachment.url))
                  : undefined
              }
            />
          )}
        </li>
      ))}
    </ul>
  );
}
