import type { Message } from '@hey-postie/core';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import { dayKey, dayLabel } from '../i18n/dates';
import type { SaveFile } from './Attachments';
import { Button } from './Button';
import { MessageBubble } from './MessageBubble';
import styles from './MessageList.module.css';

interface MessageListProps {
  messages: Message[];
  hasOlder: boolean;
  /** Resolves to true when something was prepended. */
  onLoadOlder: () => Promise<boolean>;
  /** The account's bare JID, to tell my reactions apart. */
  myJid: string | null;
  onRetry: (message: Message) => void;
  onOpenLink: (url: string) => void;
  onReact: (message: Message, emoji: string) => void;
  onSaveFile: SaveFile;
  /** In a hall: the sender's nick above each run of incoming messages. */
  showSenders?: boolean;
  /** From a letter sealed for another device: opens the sender's devices. */
  onShowDevices?: (() => void) | undefined;
  /** Rendered after the last message, inside the scroller: the parcels on their way. */
  footer?: ReactNode;
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
  myJid,
  onRetry,
  onOpenLink,
  onReact,
  onSaveFile,
  showSenders = false,
  onShowDevices,
  footer,
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
      className={styles.scroller}
      onScroll={onScroll}
      role="log"
      aria-label={text('conversation.log')}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable to scroll with the keyboard
      tabIndex={0}
    >
      {hasOlder && (
        <Button className={styles.older} onClick={() => void loadOlder()} disabled={loading}>
          {text('message.loadOlder')}
        </Button>
      )}
      {groupByDay(messages).map((day) => (
        <section key={day.key} className={styles.day}>
          <h3 className={styles.separator}>{dayLabel(locale, day.date, text)}</h3>
          {day.runs.map((run) => (
            <div key={run.messages[0]?.id} className={styles.run} data-from={run.fromJid}>
              {showSenders && run.messages[0]?.direction === 'in' && (
                <span className={styles.sender}>{senderOf(run.messages[0])}</span>
              )}
              {run.messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  last={index === run.messages.length - 1}
                  myJid={myJid}
                  onRetry={onRetry}
                  onOpenLink={onOpenLink}
                  onReact={onReact}
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
