import type { SearchHit } from '@hey-postie/core';
import { useLocale, useText } from '../core/CoreProvider';
import { formatWhen } from '../i18n/dates';
import { highlight } from './highlight';
import { messageAuthor } from './replies';

// The matched words: stamp yellow, as the "mentions you" highlight.
const MARK = 'rounded-[2px] bg-yellow px-[1px] text-on-yellow';

interface HitPreviewProps {
  hit: SearchHit;
  peerName: string;
  /** Brings the letter into view again (after the reader scrolled away from it). */
  onShow: () => void;
}

/** The current search hit under the bar: who, when, and one line with the matches highlighted. */
export function HitPreview({ hit, peerName, onShow }: HitPreviewProps) {
  const text = useText();
  const locale = useLocale();
  const { message, ranges } = hit;
  // Only a file name matched: say which files, the body may not hold the words at all.
  const files =
    ranges.length === 0 && message.attachments.length > 0
      ? text('search.files').replace('{names}', message.attachments.map((f) => f.name).join(', '))
      : null;
  return (
    <button
      type="button"
      className="flex min-w-0 cursor-pointer items-baseline gap-2 rounded-sm border-none bg-transparent px-1 py-[2px] text-left text-[13px] text-ink hover:bg-fill-hover"
      onClick={onShow}
    >
      <span className="shrink-0 font-semibold">
        {messageAuthor(message, peerName, text('reply.you'))}
      </span>
      <span className="shrink-0 text-ink-muted">{formatWhen(locale, message.sentAt, text)}</span>
      <span className="min-w-0 truncate">
        {files ??
          highlight(message.body, ranges).map((segment, index) =>
            segment.match ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and never reordered
              <mark key={index} className={MARK}>
                {segment.text}
              </mark>
            ) : (
              segment.text
            ),
          )}
      </span>
    </button>
  );
}
