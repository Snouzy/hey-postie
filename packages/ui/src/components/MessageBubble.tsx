import type { Message, MessageStatus } from '@hey-postie/core';
import { AlertCircle, Check, CheckCheck, Clock, Stamp } from 'lucide-react';
import { useLocale, useText } from '../core/CoreProvider';
import { recordEmojiUse } from '../core/settings';
import type { Emoji } from '../data/emoji';
import { formatTime } from '../i18n/dates';
import { cn } from '../lib/cn';
import { Attachments, type SaveFile } from './Attachments';
import { Button } from './Button';
import { EditHistory } from './EditHistory';
import { Linkify } from './Linkify';
import { actionsFor, type MessageAction, MessageActions } from './MessageActions';
import { QuickReactions } from './QuickReactions';
import { ReactionBar } from './ReactionBar';
import { Reactions } from './Reactions';

const SR_ONLY = 'absolute h-px w-px overflow-hidden [clip:rect(0_0_0_0)]';
const BUBBLE =
  'group/bubble relative flex max-w-[min(70%,560px)] flex-col gap-1 rounded-bubble px-3 py-2 shadow-card';
// Incoming: cream paper. Outgoing: the uniform navy.
const INCOMING = 'self-start rounded-bl-sm bg-paper-raised text-ink';
const OUTGOING = 'self-end rounded-br-sm bg-navy text-navy-contrast [&_a]:[color:inherit]';
// Someone said my name: a touch of stamp yellow, and a bar on the left.
const MENTION =
  'border-l-3 border-l-yellow bg-[color-mix(in_srgb,var(--yellow)_22%,var(--paper-raised))]';
const BODY = 'm-0 whitespace-pre-wrap wrap-anywhere';
const SEALED = `${BODY} flex items-center gap-2 font-heading [font-variation-settings:'SOFT'_100] italic text-ink-muted`;
// A letter taken back or removed: its place stays, in Postie's quiet italic.
const GONE = `${BODY} font-heading [font-variation-settings:'SOFT'_100] italic opacity-80`;
// A sealed letter that left here: a drop of wax at the corner of the bubble.
const WAX = 'absolute -top-1 -right-1 size-[10px] rounded-[50%] border-2 border-paper bg-red';
// What to do with a letter I cannot open: plain text, and a way to the sender's devices.
const HELP = 'm-0 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted';
// `leading-[1.3]` again: cn drops the button's line height when a text size is given.
const SMALL_ACTION = 'px-3 py-[2px] text-[13px] leading-[1.3]';
const SHOWN_ON_HOVER =
  'opacity-0 transition-opacity duration-(--motion-fast) group-hover/bubble:opacity-100 group-focus-within/bubble:opacity-100';
const META = `flex items-center justify-end gap-2 text-[11px] ${SHOWN_ON_HOVER}`;
// The stamp: delivery status at the bottom right of an outgoing bubble, in the bubble's own
// contrast color so it reads on navy in both themes.
const STAMP = 'inline-flex items-center gap-[2px] text-navy-contrast';
// Failed and read need to stand out: a small chip on paper, with ink or mailbox red.
const STAMP_CHIP = 'rounded-sm bg-paper-raised px-1 text-ink';
// The hover toolbar (React): floats at the top corner away from the edge, shown on hover or focus.
const TOOLS = `absolute top-[-14px] ${SHOWN_ON_HOVER}`;

interface MessageBubbleProps {
  message: Message;
  /** The last bubble of a run always shows its time; the others only on hover. */
  last: boolean;
  onRetry: (message: Message) => void;
  onOpenLink: (url: string) => void;
  onReact: (message: Message, emoji: string) => void;
  onSaveFile: SaveFile;
  /** From a letter sealed for another device: opens the sender's devices in the details pane. */
  onShowDevices?: (() => void) | undefined;
  /** Edit, delete for me or for everyone, remove from the hall: the conversation acts on it. */
  onAction?: ((message: Message, action: MessageAction) => void) | undefined;
  /** In a hall the user moderates: someone else's letter can be removed. */
  canModerate?: boolean;
  /** The viewer's favourite emojis, offered in the toolbar before "React". */
  quickEmojis?: Emoji[];
}

export function MessageBubble({
  message,
  last,
  onRetry,
  onOpenLink,
  onReact,
  onSaveFile,
  onShowDevices,
  onAction,
  canModerate = false,
  quickEmojis = [],
}: MessageBubbleProps) {
  const text = useText();
  const locale = useLocale();
  const sealed = message.encryption === 'undecryptable';
  const wax = message.direction === 'out' && message.encryption === 'omemo';
  const mention = message.isMention && message.direction === 'in';
  // A parcel alone travels with an empty body: no empty line above the card.
  const hasBody =
    !message.retracted && (sealed || message.body.length > 0 || message.attachments.length === 0);
  const incoming = message.direction === 'in';
  const { status } = message;

  /** A reaction from the toolbar counts toward the viewer's favourites. */
  function reactFromToolbar(emoji: string) {
    recordEmojiUse(emoji);
    onReact(message, emoji);
  }

  return (
    <div
      className={cn(BUBBLE, incoming ? INCOMING : OUTGOING, mention && MENTION)}
      data-status={status}
      data-message-id={message.id}
    >
      {mention && <span className={SR_ONLY}>{text('message.mention')}</span>}
      {wax && (
        <span className={WAX} title={text('message.encrypted')}>
          <span className={SR_ONLY}>{text('message.encrypted')}</span>
        </span>
      )}
      {message.status !== 'pending' && !message.retracted && (
        <div className={cn(TOOLS, 'flex gap-1', incoming ? 'right-2' : 'left-2')}>
          <QuickReactions emojis={quickEmojis} onReact={reactFromToolbar} />
          <ReactionBar onReact={reactFromToolbar} />
          {onAction && (
            <MessageActions
              actions={actionsFor(message, canModerate)}
              onPick={(action) => onAction(message, action)}
            />
          )}
        </div>
      )}
      {message.retracted && (
        <p className={GONE}>
          {text(message.retractedBy === 'moderator' ? 'message.removed' : 'message.deleted')}
          {message.moderationReason && ` (${message.moderationReason})`}
        </p>
      )}
      {hasBody && (
        <p className={sealed ? SEALED : BODY}>
          {sealed ? (
            <>
              <Stamp size={16} className="shrink-0 text-red" aria-hidden />
              {text('message.undecryptable')}
            </>
          ) : (
            <Linkify text={message.body} onOpenLink={onOpenLink} />
          )}
        </p>
      )}
      {sealed && (
        <p className={HELP}>
          {text('message.undecryptableHelp')}
          {onShowDevices && (
            <Button className={SMALL_ACTION} onClick={onShowDevices}>
              {text('message.checkDevices')}
            </Button>
          )}
        </p>
      )}
      <Attachments message={message} onSaveFile={onSaveFile} />
      <Reactions reactions={message.reactions} onToggle={(emoji) => onReact(message, emoji)} />
      <span
        className={cn(META, (last || status === 'failed' || status === 'pending') && 'opacity-100')}
      >
        {message.edited && !message.retracted && <EditHistory message={message} />}
        <time dateTime={message.sentAt.toISOString()}>{formatTime(locale, message.sentAt)}</time>
        {message.direction === 'out' && (
          <span
            className={cn(
              STAMP,
              (status === 'read' || status === 'failed') && STAMP_CHIP,
              status === 'failed' && 'text-red',
            )}
            title={text(`status.${message.status}`)}
          >
            <StatusIcon status={message.status} />
            <span className={SR_ONLY}>{text(`status.${message.status}`)}</span>
          </span>
        )}
      </span>
      {message.status === 'failed' && (
        <Button
          variant="danger"
          className={cn('self-end bg-paper-raised', SMALL_ACTION)}
          onClick={() => onRetry(message)}
        >
          {text('message.retry')}
        </Button>
      )}
    </div>
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
