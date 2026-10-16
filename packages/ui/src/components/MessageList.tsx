import type { Message } from '@hey-postie/core';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import { dayKey, dayLabel } from '../i18n/dates';
import type { SaveFile } from './Attachments';
import { Avatar } from './Avatar';
import { Button } from './Button';
import type { MessageAction } from './MessageActions';
import { MessageBubble } from './MessageBubble';

// `leading-[1.3]` again: cn drops the button's line height when a text size is given.
const OLDER = 'mx-0 my-3 self-center px-3 py-1 text-[13px] leading-[1.3]';
const SCROLLER = 'flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4';
// Sticky so the reader always knows which day they are in.
const SEPARATOR =
  'sticky top-0 z-sticky mx-0 mt-3 mb-0 self-center rounded-full border border-line bg-paper px-3 py-[2px] font-text text-[12px] font-semibold text-ink-muted';
// Who speaks, in a hall: above the run, in the sender's column.
const SENDER =
  'inline-flex items-center gap-1 self-start px-3 text-[12px] font-semibold text-ink-muted';

interface MessageListProps {
  messages: Message[];
  hasOlder: boolean;
  /** Resolves to true when something was prepended. */
  onLoadOlder: () => Promise<boolean>;
  onRetry: (message: Message) => void;
  onOpenLink: (url: string) => void;
  onReact: (message: Message, emoji: string) => void;
  onAction?: ((message: Message, action: MessageAction) => void) | undefined;
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

const BOTTOM_TOLERANCE = 8;

/** The oldest message on screen when older ones were asked for, and where it sat. */
interface Anchor {
  id: string;
  top: number;
}

/**
 * Messages grouped by day, then by consecutive sender. Stays glued to the bottom while the user
 * is there; keeps the viewport still when older messages are prepended, by holding the message
 * that was first before the load at the same place on screen.
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
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const anchor = useRef<Anchor | null>(null);
  const [loading, setLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-pins the scroll after every change of the list or its footer
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const held = anchor.current;
    // Only once something sits above the anchor: a letter arriving meanwhile does not consume it.
    if (held && messages[0]?.id !== held.id) {
      const bubble = bubbleOf(element, held.id);
      if (bubble) element.scrollTop += topOf(element, bubble) - held.top;
      anchor.current = null;
    } else if (!held && atBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, footer]);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    atBottom.current = distance < BOTTOM_TOLERANCE;
  }

  async function loadOlder() {
    const element = scroller.current;
    const first = messages[0];
    const bubble = element && first ? bubbleOf(element, first.id) : null;
    anchor.current =
      first && element && bubble ? { id: first.id, top: topOf(element, bubble) } : null;
    setLoading(true);
    try {
      // Nothing prepended: nothing to hold.
      if (!(await onLoadOlder())) anchor.current = null;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={scroller}
      className={SCROLLER}
      onScroll={onScroll}
      role="log"
      aria-label={text('conversation.log')}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable to scroll with the keyboard
      tabIndex={0}
    >
      {hasOlder && (
        <Button className={OLDER} onClick={() => void loadOlder()} disabled={loading}>
          {text('message.loadOlder')}
        </Button>
      )}
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
                  onAction={onAction}
                  canModerate={canModerate}
                  onSaveFile={onSaveFile}
                  onShowDevices={onShowDevices}
                />
              ))}
            </div>
          ))}
        </section>
      ))}
      {footer}
    </div>
  );
}

function bubbleOf(scroller: HTMLElement, id: string): HTMLElement | null {
  return scroller.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
}

/** Where a bubble sits relative to the top of the scroller's content. */
function topOf(scroller: HTMLElement, bubble: HTMLElement): number {
  return (
    bubble.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  );
}

function senderOf(message: Message): string {
  return message.fromNick ?? message.fromJid.split('/')[1] ?? message.fromJid;
}

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
    if (!run || run.fromJid !== message.fromJid) {
      run = { fromJid: message.fromJid, messages: [] };
      day.runs.push(run);
    }
    run.messages.push(message);
  }
  return days;
}
