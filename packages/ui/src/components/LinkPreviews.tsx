import type { Attachment, LinkPreview, Message } from '@hey-postie/core';
import { useText } from '../core/CoreProvider';
import { useAttachment } from '../core/useAttachment';
import { useAutoLoad } from '../core/useAutoLoad';

// A small card under the letter, in the letter's own ink: a bar, the site, the title, two lines.
const CARD =
  'flex max-w-[420px] min-w-0 gap-3 rounded-sm border-l-3 border-current/30 bg-current/5 py-2 pr-2 pl-3';
// Navy on paper; a navy bubble of mine gives its links its own ink (`[&_a]:[color:inherit]`).
const TITLE = 'font-semibold text-navy [overflow-wrap:anywhere]';
const DESCRIPTION = 'm-0 line-clamp-2 text-[13px] leading-[1.35] opacity-85';
const SITE = 'm-0 text-[12px] opacity-75';
const PICTURE = 'size-16 shrink-0 rounded-sm object-cover';

interface LinkPreviewsProps {
  message: Message;
  onOpenLink: (url: string) => void;
}

/**
 * The link previews a hall attached to a letter (spec 2026-10-17, Lot B item 13): nothing here
 * is fetched by the reader, except a preview's picture where the sender's pictures already load
 * by themselves (`files.autoLoad`); anywhere else there is no picture at all.
 */
export function LinkPreviews({ message, onOpenLink }: LinkPreviewsProps) {
  const text = useText();
  const previews = message.linkPreviews ?? [];
  const auto = useAutoLoad(
    message,
    previews.some((preview) => preview.imageUrl),
  );
  if (previews.length === 0) return null;
  return (
    <ul
      className="m-0 flex min-w-0 list-none flex-col gap-2 p-0"
      aria-label={text('message.linkPreviews')}
    >
      {previews.map((preview) => (
        <li key={preview.url} className={CARD}>
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            {preview.siteName && <p className={SITE}>{preview.siteName}</p>}
            <a
              className={TITLE}
              href={preview.url}
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                onOpenLink(preview.url);
              }}
            >
              {preview.title ?? preview.url}
            </a>
            {preview.description && <p className={DESCRIPTION}>{preview.description}</p>}
          </div>
          {auto === true && preview.imageUrl && <PreviewPicture preview={preview} />}
        </li>
      ))}
    </ul>
  );
}

/** The page's picture, fetched through the service like a parcel; nothing at all if it fails. */
function PreviewPicture({ preview }: { preview: LinkPreview }) {
  const picture: Attachment = {
    url: preview.imageUrl ?? '',
    name: preview.title ?? preview.url,
    size: 0,
    mimeType: 'application/octet-stream',
    encryption: 'none',
  };
  const loaded = useAttachment(picture);
  if (loaded.status === 'error') return null;
  if (loaded.status === 'loading')
    return <div className={`${PICTURE} hp-image-skeleton`} aria-hidden />;
  // Decorative: the title next to it says what the page is.
  return <img className={PICTURE} src={loaded.url} alt="" />;
}
