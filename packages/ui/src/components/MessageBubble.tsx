import { useLocale } from '../core/CoreProvider';
import { formatTime } from '../i18n/dates';
import { cn } from '../lib/cn';
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

// Hovered or focused, the bubble and its toolbar rise over the letters around them (a later
// picture is positioned too and would otherwise be drawn over the toolbar).
const BUBBLE =
  'group/letter relative flex max-w-[min(70%,560px)] flex-col gap-1 rounded-bubble px-3 py-2 shadow-card hover:z-float focus-within:z-float';
// Incoming: cream paper. Outgoing: the uniform navy.
const INCOMING = 'self-start rounded-bl-sm bg-paper-raised text-ink';
const OUTGOING = 'self-end rounded-br-sm bg-navy text-navy-contrast [&_a]:[color:inherit]';
// Someone said my name: a touch of stamp yellow, and a bar on the left.
const MENTION =
  'border-l-3 border-l-yellow bg-[color-mix(in_srgb,var(--yellow)_22%,var(--paper-raised))]';
const META = `flex items-center justify-end gap-2 text-[11px] ${SHOWN_ON_HOVER}`;
// Straddling the top edge, on the side that faces the column: it grows towards the middle, never
// past the list's edge (laid out even while invisible, it would make the list scroll sideways),
// and covers only the padding of the letter above (runs are 4px apart, bubbles have 8px).
// The pill (34px) rests on the bubble's top edge and dips 6px into its padding (8px): never on text.
const TOOLS = 'top-[-28px]';

/** A letter as a bubble: mine on the right in navy, the others' on the left on cream paper. */
export function MessageBubble({
  message,
  last,
  onRetry,
  onAction,
  canModerate = false,
  quickEmojis = [],
  canReply = false,
  highlighted = false,
  ...body
}: LetterProps) {
  const locale = useLocale();
  const incoming = message.direction === 'in';
  const mention = message.isMention && incoming;
  const { status } = message;

  return (
    <div
      className={cn(
        BUBBLE,
        incoming ? INCOMING : OUTGOING,
        mention && MENTION,
        highlighted && HIGHLIGHT,
      )}
      data-status={status}
      data-message-id={message.id}
      // Focusable only while highlighted: the jump puts the reader on the original.
      tabIndex={highlighted ? -1 : undefined}
    >
      {mention && <MentionNote />}
      {!incoming && message.encryption === 'omemo' && <Wax className="absolute -top-1 -right-1" />}
      {status !== 'pending' && !message.retracted && (
        <MessageToolbar
          message={message}
          actions={actionsFor(message, canModerate, canReply)}
          quickEmojis={quickEmojis}
          onReact={body.onReact}
          onAction={onAction}
          className={cn(TOOLS, incoming ? 'left-2' : 'right-2')}
        />
      )}
      <MessageBody message={message} onNavy={!incoming} {...body} />
      <span className={cn(META, metaAlwaysShown(message, last) && 'opacity-100')}>
        {message.edited && !message.retracted && <EditHistory message={message} />}
        <time dateTime={message.sentAt.toISOString()}>{formatTime(locale, message.sentAt)}</time>
        {!incoming && <StatusStamp status={status} onPaper={false} />}
      </span>
      {status === 'failed' && <RetryButton className="self-end" onRetry={() => onRetry(message)} />}
    </div>
  );
}
