import type { LinkPreview, Message } from '@hey-postie/core';
import { Link2 } from 'lucide-react';
import { ArchiveMeta } from './ArchiveMeta';
import { ShowInChatButton } from './ShowInChatButton';

interface LinkRowProps {
  message: Message;
  url: string;
  /** The hall's preview of the page, when the letter carried one; never fetched by us. */
  preview?: LinkPreview | undefined;
  peerName: string;
  onOpenLink: (url: string) => void;
  onShowInChat: () => void;
}

/** A link of the conversation: the page's title (or its address), the site, who and when. */
export function LinkRow({
  message,
  url,
  preview,
  peerName,
  onOpenLink,
  onShowInChat,
}: LinkRowProps) {
  return (
    <li className="flex items-start gap-2 rounded-sm p-2 hover:bg-fill-hover">
      <Link2 size={16} className="mt-[2px] shrink-0 text-ink-muted" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        {preview?.siteName && (
          <span className="truncate text-[12px] text-ink-muted">{preview.siteName}</span>
        )}
        <a
          className="line-clamp-2 font-semibold text-navy [overflow-wrap:anywhere]"
          href={url}
          rel="noreferrer"
          onClick={(event) => {
            event.preventDefault();
            onOpenLink(url);
          }}
        >
          {preview?.title ?? url}
        </a>
        {preview?.title && <span className="truncate text-[12px] text-ink-muted">{url}</span>}
        <ArchiveMeta message={message} peerName={peerName} />
      </div>
      <ShowInChatButton onClick={onShowInChat} />
    </li>
  );
}
