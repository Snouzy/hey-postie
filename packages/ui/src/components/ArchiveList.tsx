import type { ArchiveItem, ArchiveKind } from '@hey-postie/core';
import { useText } from '../core/CoreProvider';
import { useArchive } from '../core/useArchive';
import type { SaveFile } from './Attachments';
import { Button } from './Button';
import { DocumentRow } from './DocumentRow';
import { LinkRow } from './LinkRow';
import { MediaTile } from './MediaTile';

const NOTE = "m-0 font-heading text-[14px] text-ink-muted [font-variation-settings:'SOFT'_100]";

interface ArchiveListProps {
  chatId: string;
  kind: ArchiveKind;
  peerName: string;
  onOpenLink: (url: string) => void;
  onSaveFile: SaveFile;
  onShowInChat: (messageId: string) => void;
}

/** One tab of the archive: a grid of media, or a list of links or documents, then "Load older". */
export function ArchiveList({
  chatId,
  kind,
  peerName,
  onOpenLink,
  onSaveFile,
  onShowInChat,
}: ArchiveListProps) {
  const text = useText();
  const archive = useArchive(chatId, kind);
  const { items, next, status } = archive;

  function item(entry: ArchiveItem, index: number) {
    const show = () => onShowInChat(entry.message.id);
    // A letter can hold the same link or file twice: the position keeps the keys apart.
    const key = `${entry.message.id}:${index}`;
    if (entry.kind === 'link') {
      return (
        <LinkRow
          key={key}
          message={entry.message}
          url={entry.url}
          preview={entry.preview}
          peerName={peerName}
          onOpenLink={onOpenLink}
          onShowInChat={show}
        />
      );
    }
    if (entry.kind === 'media') {
      return (
        <MediaTile
          key={key}
          message={entry.message}
          attachment={entry.attachment}
          onSaveFile={onSaveFile}
          onShowInChat={show}
        />
      );
    }
    return (
      <DocumentRow
        key={key}
        message={entry.message}
        attachment={entry.attachment}
        peerName={peerName}
        onSaveFile={onSaveFile}
        onShowInChat={show}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <ul
          className={
            kind === 'media'
              ? 'm-0 grid list-none grid-cols-3 gap-1 p-0'
              : 'm-0 flex list-none flex-col gap-1 p-0'
          }
        >
          {items.map(item)}
        </ul>
      )}
      {status === 'ready' && items.length === 0 && (
        <p className={NOTE}>{text(next ? 'archive.emptyRecent' : `archive.empty.${kind}`)}</p>
      )}
      {status === 'loading' && (
        <p className={NOTE} role="status">
          {text('archive.loading')}
        </p>
      )}
      {status === 'error' && (
        <p
          className="m-0 flex flex-wrap items-center gap-2 font-heading text-[14px] text-red [font-variation-settings:'SOFT'_100]"
          role="alert"
        >
          {text('archive.failed')}
          <Button className="px-3 py-[2px] text-[13px] leading-[1.3]" onClick={archive.retry}>
            {text('archive.retry')}
          </Button>
        </p>
      )}
      {status === 'ready' && next && (
        <Button className="self-center" onClick={() => void archive.loadOlder()}>
          {text('archive.loadOlder')}
        </Button>
      )}
    </div>
  );
}
