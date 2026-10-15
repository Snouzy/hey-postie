import type { Message } from '@hey-postie/core';
import { useLayoutEffect, useRef, useState } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import { dayKey, dayLabel } from '../i18n/dates';
import { Button } from './Button';
import { MessageBubble } from './MessageBubble';
import styles from './MessageList.module.css';

interface MessageListProps {
  messages: Message[];
  hasOlder: boolean;
  /** Resolves to true when something was prepended. */
  onLoadOlder: () => Promise<boolean>;
  onRetry: (message: Message) => void;
  onOpenLink: (url: string) => void;
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

/**
 * Messages grouped by day, then by consecutive sender. Stays glued to the bottom while the user
 * is there; keeps the viewport still when older messages are prepended.
 */
export function MessageList({
  messages,
  hasOlder,
  onLoadOlder,
  onRetry,
  onOpenLink,
}: MessageListProps) {
  const text = useText();
  const locale = useLocale();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const heightBeforeOlder = useRef<number | null>(null);
  const [loading, setLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-pins the scroll after every change of the list
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (heightBeforeOlder.current !== null) {
      element.scrollTop += element.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
    } else if (atBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    atBottom.current = distance < BOTTOM_TOLERANCE;
  }

  async function loadOlder() {
    heightBeforeOlder.current = scroller.current?.scrollHeight ?? 0;
    setLoading(true);
    try {
      // Nothing prepended: nothing to compensate, or the next new message would jump.
      if (!(await onLoadOlder())) heightBeforeOlder.current = null;
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
              {run.messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  last={index === run.messages.length - 1}
                  onRetry={onRetry}
                  onOpenLink={onOpenLink}
                />
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
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
