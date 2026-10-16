import type { Message, MessageStatus } from '@hey-postie/core';
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import type { Emoji } from '../data/emoji';
import { cn } from '../lib/cn';
import { Button } from './Button';
import type { MessageAction } from './MessageActions';
import type { MessageBodyProps } from './MessageBody';

/** Small pieces a letter shows in both layouts, bubbles (`MessageBubble`) and lines (`MessageLine`). */

/** What a letter takes, in either layout. */
export interface LetterProps extends MessageBodyProps {
  /** The last letter of a run always shows its time and stamp; the others only on hover. */
  last: boolean;
  onRetry: (message: Message) => void;
  /** Edit, delete for me or for everyone, remove from the hall: the conversation acts on it. */
  onAction?: ((message: Message, action: MessageAction) => void) | undefined;
  /** In a hall the user moderates: someone else's letter can be removed. */
  canModerate?: boolean;
  /** The viewer's favourite emojis, offered in the toolbar before "React". */
  quickEmojis?: Emoji[];
  /** The user can write here: "Reply" is offered. */
  canReply?: boolean;
  /** Just jumped to from a reply's quote. */
  highlighted?: boolean;
}

export const SR_ONLY = 'absolute h-px w-px overflow-hidden [clip:rect(0_0_0_0)]';
/** Shown while the letter (`group/letter`) is hovered or holds the focus. */
export const SHOWN_ON_HOVER =
  'opacity-0 transition-opacity duration-(--motion-fast) group-hover/letter:opacity-100 group-focus-within/letter:opacity-100';
/** The original of a reply, just jumped to: a stamp-yellow ring for a moment. */
export const HIGHLIGHT = 'ring-3 ring-yellow';
// `leading-[1.3]` again: cn drops the button's line height when a text size is given.
export const SMALL_ACTION = 'px-3 py-[2px] text-[13px] leading-[1.3]';
// A sealed letter that left here: a drop of wax.
const WAX = 'size-[10px] rounded-[50%] border-2 border-paper bg-red';

/** Whether the time and stamp of a letter stay visible without a hover. */
export function metaAlwaysShown(message: Message, last: boolean): boolean {
  return last || message.status === 'failed' || message.status === 'pending';
}

/** "Mentions you", for screen readers: the highlight says it to the eye. */
export function MentionNote() {
  const text = useText();
  return <span className={SR_ONLY}>{text('message.mention')}</span>;
}

/** The drop of wax of a sealed letter of mine, placed by the caller. */
export function Wax({ className }: { className?: string }) {
  const text = useText();
  return (
    <span className={cn(WAX, className)} title={text('message.encrypted')}>
      <span className={SR_ONLY}>{text('message.encrypted')}</span>
    </span>
  );
}

/**
 * The delivery stamp of a letter of mine. On a navy bubble it takes the bubble's contrast ink,
 * and failed or read stand out as a small chip on paper; on paper (lines) read is navy, failed red.
 */
export function StatusStamp({ status, onPaper }: { status: MessageStatus; onPaper: boolean }) {
  const text = useText();
  const standsOut = status === 'read' || status === 'failed';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[2px]',
        onPaper ? 'text-ink-muted' : 'text-navy-contrast',
        !onPaper && standsOut && 'rounded-sm bg-paper-raised px-1 text-ink',
        onPaper && status === 'read' && 'text-navy',
        status === 'failed' && 'text-red',
      )}
      title={text(`status.${status}`)}
    >
      <StatusIcon status={status} />
      <span className={SR_ONLY}>{text(`status.${status}`)}</span>
    </span>
  );
}

function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'pending':
      return <Clock size={14} aria-hidden />;
    case 'sent':
      return <Check size={14} aria-hidden />;
    case 'delivered':
    case 'read':
      return <CheckCheck size={14} aria-hidden />;
    case 'failed':
      return <AlertCircle size={14} aria-hidden />;
  }
}

/** "Retry" under a letter that failed to leave. */
export function RetryButton({ onRetry, className }: { onRetry: () => void; className: string }) {
  const text = useText();
  return (
    <Button
      variant="danger"
      className={cn('bg-paper-raised', SMALL_ACTION, className)}
      onClick={onRetry}
    >
      {text('message.retry')}
    </Button>
  );
}
