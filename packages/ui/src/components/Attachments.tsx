import type { Attachment, Message } from '@hey-postie/core';
import { useState } from 'react';
import { useCore } from '../core/CoreProvider';
import { useAutoLoad } from '../core/useAutoLoad';
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
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const { attachments } = message;
  const auto = useAutoLoad(message, attachments.length > 0);

  if (attachments.length === 0 || auto === null) return null;

  function inline(attachment: Attachment): boolean {
    return core.files.isInlineImage(attachment) && (auto === true || loaded.has(attachment.url));
  }

  return (
    <ul className="m-0 flex min-w-0 list-none flex-col gap-2 p-0">
      {attachments.map((attachment) => (
        <li key={attachment.url} className="flex min-w-0">
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
