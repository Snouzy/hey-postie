import type { Attachment, Message } from '@hey-postie/core';
import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useAutoLoad } from '../core/useAutoLoad';
import type { SaveFile } from './Attachments';
import { fileIcon } from './fileIcon';
import { MediaThumb } from './MediaThumb';
import { ShowInChatButton } from './ShowInChatButton';
import { useSaveFile } from './useSaveFile';

// Kraft, like a parcel card: a picture not fetched yet, or a video (no frame is drawn from it).
const PLACEHOLDER =
  'flex size-full cursor-pointer flex-col items-center justify-center gap-1 border-none bg-kraft-soft p-1 text-kraft-ink';
// Over the corner of the tile; shown on hover or when reached with the keyboard.
const SHOW =
  'absolute top-1 right-1 bg-paper-raised opacity-0 shadow-card group-hover/tile:opacity-100 focus-visible:opacity-100';

interface MediaTileProps {
  message: Message;
  attachment: Attachment;
  onSaveFile: SaveFile;
  onShowInChat: () => void;
}

/**
 * A square of the media grid. A picture is fetched without a click only where the letter's
 * pictures load by themselves (`files.autoLoad`, the rule of the conversation); anywhere else it
 * waits as a kraft square that loads it on click. A video is a square with its name; a click
 * downloads it.
 */
export function MediaTile({ message, attachment, onSaveFile, onShowInChat }: MediaTileProps) {
  const core = useCore();
  const text = useText();
  const picture = core.files.isInlineImage(attachment);
  const auto = useAutoLoad(message, picture);
  const [asked, setAsked] = useState(false);
  const { save, saving } = useSaveFile(onSaveFile);
  const Icon = fileIcon(attachment.mimeType);
  const label = text(picture ? 'archive.loadMedia' : 'archive.download').replace(
    '{name}',
    attachment.name,
  );

  return (
    <li className="group/tile relative aspect-square min-w-0 overflow-hidden rounded-sm">
      {picture && (auto === true || asked) ? (
        <MediaThumb attachment={attachment} onSaveFile={onSaveFile} onShowInChat={onShowInChat} />
      ) : (
        <button
          type="button"
          className={PLACEHOLDER}
          aria-label={label}
          title={label}
          disabled={saving}
          onClick={() => (picture ? setAsked(true) : void save(attachment))}
        >
          <Icon size={24} aria-hidden />
          <span className="w-full truncate text-center text-[11px]">{attachment.name}</span>
        </button>
      )}
      <ShowInChatButton className={SHOW} onClick={onShowInChat} />
    </li>
  );
}
