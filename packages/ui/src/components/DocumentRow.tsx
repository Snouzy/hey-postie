import type { Attachment, Message } from '@hey-postie/core';
import { useLocale, useText } from '../core/CoreProvider';
import { formatBytes } from '../i18n/bytes';
import { ArchiveMeta } from './ArchiveMeta';
import type { SaveFile } from './Attachments';
import { fileIcon } from './fileIcon';
import { ShowInChatButton } from './ShowInChatButton';
import { useSaveFile } from './useSaveFile';

interface DocumentRowProps {
  message: Message;
  attachment: Attachment;
  peerName: string;
  onSaveFile: SaveFile;
  onShowInChat: () => void;
}

/** A file of the conversation: its name, size, who and when; a click downloads it. */
export function DocumentRow({
  message,
  attachment,
  peerName,
  onSaveFile,
  onShowInChat,
}: DocumentRowProps) {
  const text = useText();
  const locale = useLocale();
  const { save, saving, error } = useSaveFile(onSaveFile);
  const Icon = fileIcon(attachment.mimeType);
  return (
    <li className="flex flex-col rounded-sm hover:bg-fill-hover">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent p-2 text-left text-ink"
          onClick={() => void save(attachment)}
          disabled={saving}
          aria-busy={saving}
          title={text('archive.download').replace('{name}', attachment.name)}
        >
          <Icon size={24} className="shrink-0 text-kraft-ink" aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-semibold">{attachment.name}</span>
            <ArchiveMeta
              message={message}
              peerName={peerName}
              lead={attachment.size > 0 ? formatBytes(locale, attachment.size) : undefined}
            />
          </span>
        </button>
        <ShowInChatButton onClick={onShowInChat} />
      </div>
      {error && (
        <p
          className="m-0 px-2 pb-2 font-heading text-[13px] text-red [font-variation-settings:'SOFT'_100]"
          role="alert"
        >
          {text('parcel.fetchFailed')}
        </p>
      )}
    </li>
  );
}
