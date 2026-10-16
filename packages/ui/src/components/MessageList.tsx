import type { Message } from '@hey-postie/core';
import { type ReactNode, useEffect, useState } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import { type Density, readEmojiUsage } from '../core/settings';
import { favouriteEmojis } from '../data/emoji';
import { dayKey, dayLabel } from '../i18n/dates';
import { cn } from '../lib/cn';
import type { SaveFile } from './Attachments';
import { Avatar } from './Avatar';
import { DENSITY_CLASSES } from './density';
import type { MessageAction } from './MessageActions';
import { MessageBubble } from './MessageBubble';
import { MessageLine } from './MessageLine';
import { NewDivider } from './NewDivider';
import { NewLettersPill } from './NewLettersPill';
import { replyAuthor } from './replies';
import { useMessageScroll } from './useMessageScroll';

const SCROLLER = 'flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4';
// Sticky so the reader always knows which day they are in.
const SEPARATOR =
  'sticky top-0 z-sticky mx-0 mt-3 mb-0 self-center rounded-full border border-line bg-paper px-3 py-[2px] font-text text-[12px] font-semibold text-ink-muted';
// Who speaks, in a hall: above the run, in the sender's column.
const SENDER =
  'inline-flex items-center gap-1 self-start px-3 text-[12px] font-semibold text-ink-muted';
// Floats over the top of the list rather than pushing the letters down while the page loads.
const LOADING =
  'pointer-events-none absolute inset-x-0 top-10 z-float m-0 flex justify-center text-[13px] text-ink-muted italic';
// Over the bottom of the list: the copy confirmation and the way back down.
const OVERLAY =
  'pointer-events-none absolute inset-x-0 bottom-3 z-float flex flex-col items-center gap-2';
const CHIP = 'm-0 rounded-full bg-paper-raised px-3 py-1 shadow-card';
const COPIED = 'm-0 rounded-full bg-ink px-3 py-1 text-[13px] text-paper shadow-card';
const COPIED_FOR_MS = 2000;
/** How long the original of a reply stays highlighted after a jump to it. */
export const HIGHLIGHT_FOR_MS = 1600;

interface MessageListProps {
  messages: Message[];
  hasOlder: boolean;
  /** Resolves to true when something was prepended. */
  onLoadOlder: () => Promise<boolean>;
  onRetry: (message: Message) => void;
  onOpenLink: (url: string) => void;
  onReact: (message: Message, emoji: string) => void;
  /** Edit and delete: the conversation acts on them. "Copy text" is done here. */
  onAction?: ((message: Message, action: Exclude<MessageAction, 'copy'>) => void) | undefined;
  /** In a hall the user moderates. */
  canModerate?: boolean;
  /** The user can write in this chat: letters offer "Reply". */
  canReply?: boolean;
  /** The first letter that was unread when the chat opened: the "New" line goes above it. */
  newFrom?: string | undefined;
  /** What the conversation calls the peer of a direct chat (the author of a quoted letter). */
  peerName?: string;
  /** My nick in a hall: the mention chip naming me stands out. */
  ownNick?: string | undefined;
  onSaveFile: SaveFile;
  /** In a hall: the sender's nick above each run of incoming messages, and on each line. */
  showSenders?: boolean;
  /** Bubbles, or lines (Slack, Buzz): resolved from the setting by the conversation. */
  layout?: 'bubbles' | 'lines';
  /** The room between letters (Settings › Appearance). */
  density?: Density;
  /** My name on my lines in a direct chat (a hall shows my nick). */
  ownName?: string;
  /** From a letter sealed for another device: opens the sender's devices. */
  onShowDevices?: (() => void) | undefined;
  /** Rendered after the last message, inside the scroller: the parcels on their way. */
  footer?: ReactNode;
  /** Rendered in place of the messages while there is none. */
  empty?: ReactNode;
  /**
   * A letter to bring into view and flash (a search hit, an item of the archive); `seq` changes
   * on every request, so asking for the same letter twice moves the view again. `keepFocus`: the
   * reader stays where they are (the search field), instead of landing on the letter.
   */
  jump?: { id: string; seq: number; keepFocus?: boolean } | undefined;
}

interface Run {
  fromJid: string;
  messages: Message[];
  /** The run starts at the first unread letter: the "New" line goes above it. */
  isNew?: boolean;
}
interface Day {
  key: string;
  date: Date;
  runs: Run[];
}

/**
 * Messages grouped by day, then into runs of one sender. The scroll rules (glued to the bottom,
 * arrivals counted while scrolled up, older pages near the top) are `useMessageScroll`'s.
 */
export function MessageList({
  messages,
  hasOlder,
  onLoadOlder,
  onRetry,
  onOpenLink,
  onReact,
  onAction,
  canModerate = false,
  canReply = false,
  newFrom,
  peerName = '',
  ownNick,
  onSaveFile,
  showSenders = false,
  layout = 'bubbles',
  density = 'comfortable',
  ownName = '',
  onShowDevices,
  footer,
  empty,
  jump,
}: MessageListProps) {
  const text = useText();
  const locale = useLocale();
  const scroll = useMessageScroll({ messages, footer, hasOlder, onLoadOlder });
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  // Read once per render of the list, not once per bubble.
  const quickEmojis = favouriteEmojis(readEmojiUsage());

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(null), HIGHLIGHT_FOR_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  // After the scroll rules have placed the list (layout effects run first): the letter is loaded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new request, not a new list, moves the view
  useEffect(() => {
    if (jump) jumpTo(jump.id, !jump.keepFocus);
  }, [jump]);

  /** From a reply's quote, or a `jump`: the letter, centred, highlighted, and the reader on it. */
  function jumpTo(id: string, takeFocus = true) {
    const scroller = scroll.scroller.current;
    const bubble = scroller?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
    if (!scroller || !bubble) return;
    setHighlighted(id);
    // The list alone moves (no `scrollIntoView`, which may scroll the screen: see "What scrolls").
    const top = bubble.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += top - (scroller.clientHeight - bubble.offsetHeight) / 2;
    if (takeFocus) requestAnimationFrame(() => bubble.focus({ preventScroll: true }));
  }

  const loaded = new Set(messages.map((message) => message.id));
  const you = text('reply.you');
  const lines = layout === 'lines';
  const spacing = DENSITY_CLASSES[density];

  /** Who wrote a letter, on its line: the nick in a hall, else the peer or me. */
  function nameOf(message: Message): string {
    if (showSenders) return senderOf(message);
    return message.direction === 'out' ? ownName || you : peerName;
  }

  async function act(message: Message, action: MessageAction) {
    if (action !== 'copy') return onAction?.(message, action);
    try {
      await navigator.clipboard.writeText(message.body);
      setCopied(true);
    } catch {
      // No clipboard (a denied permission): the text stays selectable in the bubble.
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroll.scroller}
        className={SCROLLER}
        onScroll={scroll.onScroll}
        role="log"
        aria-label={text('conversation.log')}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable to scroll with the keyboard
        tabIndex={0}
      >
        {messages.length === 0 && empty}
        {groupByDay(messages, newFrom).map((day) => (
          <section
            key={day.key}
            className={cn('flex flex-col', lines ? spacing.lineRuns : spacing.bubbleRuns)}
          >
            <h3 className={SEPARATOR}>{dayLabel(locale, day.date, text)}</h3>
            {day.runs.map((run) => (
              // A run of messages from one sender: tight spacing inside, room between runs.
              <div
                key={run.messages[0]?.id}
                className={cn('flex flex-col', !lines && spacing.bubbles)}
                data-from={run.fromJid}
              >
                {run.isNew && <NewDivider />}
                {!lines && showSenders && run.messages[0]?.direction === 'in' && (
                  <span className={SENDER}>
                    <Avatar name={senderOf(run.messages[0])} jid={run.fromJid} size={20} />
                    {senderOf(run.messages[0])}
                  </span>
                )}
                {run.messages.map((message, index) => {
                  const letter = {
                    message,
                    last: index === run.messages.length - 1,
                    onRetry,
                    onOpenLink,
                    onReact,
                    onAction: onAction && act,
                    canModerate,
                    onSaveFile,
                    onShowDevices,
                    quickEmojis,
                    canReply,
                    ownNick,
                    replyAuthor: message.replyTo && replyAuthor(message.replyTo, peerName, you),
                    onJumpToReply:
                      message.replyTo && loaded.has(message.replyTo.id)
                        ? () => jumpTo(message.replyTo?.id ?? '')
                        : undefined,
                    highlighted: highlighted === message.id,
                  };
                  return lines ? (
                    <MessageLine
                      key={message.id}
                      {...letter}
                      first={index === 0}
                      name={nameOf(message)}
                      avatarJid={run.fromJid}
                      spacing={spacing.line}
                    />
                  ) : (
                    <MessageBubble key={message.id} {...letter} />
                  );
                })}
              </div>
            ))}
          </section>
        ))}
        {footer}
      </div>
      {scroll.loading && (
        <p className={LOADING}>
          <span className={CHIP}>{text('conversation.loadingOlder')}</span>
        </p>
      )}
      <div className={OVERLAY}>
        {/* Always there, so that the sentence put in it is announced. */}
        <div aria-live="polite">{copied && <p className={COPIED}>{text('message.copied')}</p>}</div>
        {scroll.away && <NewLettersPill unseen={scroll.unseen} onClick={scroll.jumpToLatest} />}
      </div>
    </div>
  );
}

function senderOf(message: Message): string {
  return message.fromNick ?? message.fromJid.split('/')[1] ?? message.fromJid;
}

/** A sender's letters further apart than this start a new run, with their name again. */
export const RUN_GAP_MS = 10 * 60 * 1000;

/**
 * Grouped by calendar day, then into runs: one sender, each letter within `RUN_GAP_MS` of the
 * last. `newFrom` starts a run of its own, marked `isNew`.
 */
export function groupByDay(messages: Message[], newFrom?: string): Day[] {
  const days: Day[] = [];
  for (const message of messages) {
    const key = dayKey(message.sentAt);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, date: message.sentAt, runs: [] };
      days.push(day);
    }
    let run = day.runs[day.runs.length - 1];
    const previous = run?.messages[run.messages.length - 1];
    const gap = previous ? message.sentAt.getTime() - previous.sentAt.getTime() : 0;
    const isNew = message.id === newFrom;
    if (!run || run.fromJid !== message.fromJid || gap > RUN_GAP_MS || isNew) {
      run = isNew
        ? { fromJid: message.fromJid, messages: [], isNew }
        : { fromJid: message.fromJid, messages: [] };
      day.runs.push(run);
    }
    run.messages.push(message);
  }
  return days;
}
