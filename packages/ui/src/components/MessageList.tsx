import type { Message } from '@hey-postie/core';
import { type ReactNode, useEffect, useState } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import { readEmojiUsage } from '../core/settings';
import { favouriteEmojis } from '../data/emoji';
import { dayKey, dayLabel } from '../i18n/dates';
import type { SaveFile } from './Attachments';
import { Avatar } from './Avatar';
import type { MessageAction } from './MessageActions';
import { MessageBubble } from './MessageBubble';
import { NewLettersPill } from './NewLettersPill';
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
  onSaveFile: SaveFile;
  /** In a hall: the sender's nick above each run of incoming messages. */
  showSenders?: boolean;
  /** From a letter sealed for another device: opens the sender's devices. */
  onShowDevices?: (() => void) | undefined;
  /** Rendered after the last message, inside the scroller: the parcels on their way. */
  footer?: ReactNode;
  /** Rendered in place of the messages while there is none. */
  empty?: ReactNode;
}

interface Run {
  fromJid: string;
  messages: Message[];
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
  onSaveFile,
  showSenders = false,
  onShowDevices,
  footer,
  empty,
}: MessageListProps) {
  const text = useText();
  const locale = useLocale();
  const scroll = useMessageScroll({ messages, footer, hasOlder, onLoadOlder });
  const [copied, setCopied] = useState(false);
  // Read once per render of the list, not once per bubble.
  const quickEmojis = favouriteEmojis(readEmojiUsage());

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [copied]);

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
        {groupByDay(messages).map((day) => (
          <section key={day.key} className="flex flex-col gap-3">
            <h3 className={SEPARATOR}>{dayLabel(locale, day.date, text)}</h3>
            {day.runs.map((run) => (
              // A run of messages from one sender: tight spacing inside, room between runs.
              <div
                key={run.messages[0]?.id}
                className="flex flex-col gap-[2px]"
                data-from={run.fromJid}
              >
                {showSenders && run.messages[0]?.direction === 'in' && (
                  <span className={SENDER}>
                    <Avatar name={senderOf(run.messages[0])} jid={run.fromJid} size={20} />
                    {senderOf(run.messages[0])}
                  </span>
                )}
                {run.messages.map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    last={index === run.messages.length - 1}
                    onRetry={onRetry}
                    onOpenLink={onOpenLink}
                    onReact={onReact}
                    onAction={onAction && act}
                    canModerate={canModerate}
                    onSaveFile={onSaveFile}
                    onShowDevices={onShowDevices}
                    quickEmojis={quickEmojis}
                  />
                ))}
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

/** Grouped by calendar day, then into runs: one sender, each letter within `RUN_GAP_MS` of the last. */
export function groupByDay(messages: Message[]): Day[] {
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
    if (!run || run.fromJid !== message.fromJid || gap > RUN_GAP_MS) {
      run = { fromJid: message.fromJid, messages: [] };
      day.runs.push(run);
    }
    run.messages.push(message);
  }
  return days;
}
