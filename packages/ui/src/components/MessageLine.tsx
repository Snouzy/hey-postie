import { useLocale } from '../core/CoreProvider';
import { formatTime } from '../i18n/dates';
import { cn } from '../lib/cn';
import { Avatar } from './Avatar';
import { EditHistory } from './EditHistory';
import { actionsFor } from './MessageActions';
import { MessageBody } from './MessageBody';
import { MessageToolbar } from './MessageToolbar';
import {
  HIGHLIGHT,
  type LetterProps,
  MentionNote,
  metaAlwaysShown,
  RetryButton,
  SHOWN_ON_HOVER,
  StatusStamp,
  Wax,
} from './messageParts';

// A row across the column (Slack, Buzz): no bubble, a soft fill under the pointer. Hovered or
// focused, it rises with its toolbar over the rows around it, as a bubble does.
const LINE =
  'group/letter relative -mx-2 flex items-start gap-2 rounded-sm px-2 text-ink hover:z-float focus-within:z-float';
const HOVER = 'hover:bg-fill-hover focus-within:bg-fill-hover';
// Someone said my name: the same stamp yellow and bar as a bubble's, on the page's paper.
const MENTION =
  'rounded-l-none border-l-3 border-l-yellow bg-[color-mix(in_srgb,var(--yellow)_18%,var(--paper))]';
// The avatar's column; on the following rows of a run, the time shows there on hover.
const GUTTER = 'flex w-9 shrink-0 justify-end';
const GUTTER_TIME = `pt-[3px] text-[11px] leading-[1.4] text-ink-muted ${SHOWN_ON_HOVER}`;
const NAME = 'm-0 flex items-baseline gap-2 leading-[1.3]';
const META = 'flex shrink-0 items-center gap-2 self-end pb-[2px] text-[11px] text-ink-muted';
// Inside the row, at its top right: it never pokes past the list's edge.
// As in Slack: the pill straddles the row's top edge, over the padding, clear of the name and text.
const TOOLS = 'top-[-28px] right-2';

interface MessageLineProps extends LetterProps {
  /** The first row of a run carries the avatar, the name and the time. */
  first: boolean;
  /** Who wrote it, as the conversation calls them. */
  name: string;
  /** Picks the colour of the avatar's initials. */
  avatarJid: string;
  /** The row's vertical padding, from the density. */
  spacing: string;
}

/**
 * A letter as a line (the second layout, Buzz spec decision 4): everything a bubble shows, laid
 * out as a row. The edit mark, the wax and the stamp of mine sit at the row's bottom right; the
 * stamp shows on hover, or always on the last row of a run, as in a bubble.
 */
export function MessageLine({
  message,
  first,
  name,
  avatarJid,
  spacing,
  last,
  onRetry,
  onAction,
  canModerate = false,
  quickEmojis = [],
  canReply = false,
  highlighted = false,
  ...body
}: MessageLineProps) {
  const locale = useLocale();
  const incoming = message.direction === 'in';
  const mention = message.isMention && incoming;
  const { status } = message;
  const time = (
    <time dateTime={message.sentAt.toISOString()}>{formatTime(locale, message.sentAt)}</time>
  );
  const edited = message.edited && !message.retracted;
  const wax = !incoming && message.encryption === 'omemo';

  return (
    <div
      className={cn(LINE, spacing, mention ? MENTION : HOVER, highlighted && HIGHLIGHT)}
      data-status={status}
      data-message-id={message.id}
      // Focusable only while highlighted: the jump puts the reader on the original.
      tabIndex={highlighted ? -1 : undefined}
    >
      {mention && <MentionNote />}
      <div className={GUTTER}>
        {first ? (
          <Avatar name={name} jid={avatarJid} size={36} />
        ) : (
          <span className={GUTTER_TIME}>{time}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {first && (
            <p className={NAME}>
              <span className="text-[14px] font-bold">{name}</span>
              <span className="text-[12px] text-ink-muted">{time}</span>
            </p>
          )}
          <MessageBody message={message} onNavy={false} {...body} />
          {status === 'failed' && (
            <RetryButton className="self-start" onRetry={() => onRetry(message)} />
          )}
        </div>
        {(edited || !incoming) && (
          <span className={META}>
            {wax && <Wax />}
            {edited && <EditHistory message={message} />}
            {!incoming && (
              <span
                className={cn(
                  'flex',
                  SHOWN_ON_HOVER,
                  metaAlwaysShown(message, last) && 'opacity-100',
                )}
              >
                <StatusStamp status={status} onPaper />
              </span>
            )}
          </span>
        )}
      </div>
      {status !== 'pending' && !message.retracted && (
        <MessageToolbar
          message={message}
          actions={actionsFor(message, canModerate, canReply)}
          quickEmojis={quickEmojis}
          onReact={body.onReact}
          onAction={onAction}
          className={TOOLS}
        />
      )}
    </div>
  );
}
