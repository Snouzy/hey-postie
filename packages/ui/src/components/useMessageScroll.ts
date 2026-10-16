import type { Message } from '@hey-postie/core';
import { useLayoutEffect, useRef, useState } from 'react';

/** Closer to the bottom than this, the reader is "at the latest": arrivals scroll into view. */
export const BOTTOM_TOLERANCE = 32;
/** Closer to the top than this, the older page is asked for. */
export const LOAD_OLDER_DISTANCE = 200;

/** The oldest message on screen when older ones were asked for, and where it sat. */
interface Anchor {
  id: string;
  top: number;
}

interface Options {
  messages: Message[];
  /** Anything else drawn in the scroller (the parcels on their way): it can grow it too. */
  footer: unknown;
  hasOlder: boolean;
  /** Resolves to true when something was prepended. */
  onLoadOlder: () => Promise<boolean>;
}

/**
 * The scroll rules of the message list (spec 2026-10-17, Lot A items 4 and 5):
 * - at the bottom, the list stays glued to it as letters arrive;
 * - scrolled up, the view does not move: the letters from others that arrived since are counted
 *   (`unseen`) until the reader comes back down, by hand or through `jumpToLatest`;
 * - a letter of mine always brings the view to the bottom;
 * - near the top, the older page loads by itself, and the message that was first stays where it
 *   was on screen when the page lands above it.
 */
export function useMessageScroll({ messages, footer, hasOlder, onLoadOlder }: Options) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const anchor = useRef<Anchor | null>(null);
  const lastId = useRef<string | undefined>(undefined);
  const loadingNow = useRef(false);
  const [loading, setLoading] = useState(false);
  const [away, setAway] = useState(false);
  // The last letter the reader had in view at the bottom: what came after it is unseen.
  const [seenId, setSeenId] = useState<string | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-pins the scroll after every change of the list or its footer
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const last = messages[messages.length - 1];
    const mineArrived =
      last !== undefined && last.id !== lastId.current && last.direction === 'out';
    lastId.current = last?.id;
    const held = anchor.current;
    // Only once something sits above the anchor: a letter arriving meanwhile does not consume it.
    if (held && messages[0]?.id !== held.id) {
      const bubble = bubbleOf(element, held.id);
      if (bubble) element.scrollTop += topOf(element, bubble) - held.top;
      anchor.current = null;
    } else if (!held && (atBottom.current || mineArrived)) {
      element.scrollTop = element.scrollHeight;
      atBottom.current = true;
      setAway(false);
    }
    if (atBottom.current) setSeenId(last?.id);
  }, [messages, footer]);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    atBottom.current = distance < BOTTOM_TOLERANCE;
    setAway(!atBottom.current);
    if (atBottom.current) setSeenId(messages[messages.length - 1]?.id);
    if (element.scrollTop < LOAD_OLDER_DISTANCE && hasOlder) void loadOlder();
  }

  async function loadOlder() {
    if (loadingNow.current) return;
    loadingNow.current = true;
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
      loadingNow.current = false;
      setLoading(false);
    }
  }

  /** The pill: down to the latest letter, which releases the count. */
  function jumpToLatest() {
    const element = scroller.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    atBottom.current = true;
    setAway(false);
    setSeenId(messages[messages.length - 1]?.id);
    // The pill goes away under the focus: the reader lands on the letters.
    element.focus({ preventScroll: true });
  }

  return {
    scroller,
    onScroll,
    loading,
    away,
    unseen: away ? unseenCount(messages, seenId) : 0,
    jumpToLatest,
  };
}

/** The letters from others after the last one seen; none when that one is no longer listed. */
export function unseenCount(messages: Message[], seenId: string | undefined): number {
  const index = messages.findIndex((message) => message.id === seenId);
  if (index < 0) return 0;
  return messages.slice(index + 1).filter((message) => message.direction === 'in').length;
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
