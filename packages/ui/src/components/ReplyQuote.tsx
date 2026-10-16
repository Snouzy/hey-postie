import type { ReplyTo } from '@hey-postie/core';
import { useText } from '../core/CoreProvider';
import { cn } from '../lib/cn';

const SR_ONLY = 'absolute h-px w-px overflow-hidden [clip:rect(0_0_0_0)]';
// The original above the reply: a bar in the bubble's own ink, the text a step quieter.
const QUOTE =
  'm-0 flex min-w-0 flex-col items-start rounded-sm border-l-3 border-current/40 bg-transparent py-[2px] pr-1 pl-2 text-left text-[13px] leading-[1.3] text-inherit opacity-85';
const CLICKABLE =
  'cursor-pointer transition-opacity duration-(--motion-fast) hover:opacity-100 focus-visible:opacity-100';

interface ReplyQuoteProps {
  replyTo: ReplyTo;
  /** Who wrote the original, as the conversation calls them. */
  author: string;
  /** Scrolls to the original; absent when it is not loaded. */
  onJump?: (() => void) | undefined;
}

/** The letter a reply answers: its author and one line, a way back to it when it is loaded. */
export function ReplyQuote({ replyTo, author, onJump }: ReplyQuoteProps) {
  const text = useText();
  const content = (
    <>
      <span className={SR_ONLY}>{text('reply.inReplyTo')}</span>{' '}
      <span className="max-w-full truncate font-semibold">{author}</span>{' '}
      {replyTo.excerpt && <span className="max-w-full truncate">{replyTo.excerpt}</span>}
    </>
  );
  if (!onJump) return <div className={QUOTE}>{content}</div>;
  return (
    <button
      type="button"
      className={cn(QUOTE, CLICKABLE, 'w-full')}
      title={text('reply.show')}
      onClick={onJump}
    >
      {content}
    </button>
  );
}
