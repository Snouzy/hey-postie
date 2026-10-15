import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './Popover.module.css';

interface PopoverProps {
  /** The button that opened it: the card sits above it (below when there is no room). */
  anchor: HTMLElement | null;
  label: string;
  /** Esc, or a click outside. The opener gives the focus back. */
  onClose: () => void;
  children: ReactNode;
}

const MARGIN = 8;

/**
 * A small floating card next to its opener. Positioned on the viewport (not inside the scrolling
 * list), so a message list or a composer never clips it; follows the opener when the page scrolls
 * or the window resizes.
 */
export function Popover({ anchor, label, onClose, children }: PopoverProps) {
  const card = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const element = card.current;
    if (!element || !anchor) return;
    const at = anchor.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const above = at.top - height - MARGIN;
    const top = above >= MARGIN ? above : Math.min(at.bottom + MARGIN, window.innerHeight - height);
    const left = Math.max(MARGIN, Math.min(at.left, window.innerWidth - width - MARGIN));
    setPosition({ top: Math.max(MARGIN, top), left });
  }, [anchor]);

  useLayoutEffect(place, [place]);

  useEffect(() => {
    // Scroll does not bubble: the capture phase hears every scroller on the page.
    document.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [place]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!card.current?.contains(target) && !anchor?.contains(target)) onClose();
    };
    // Wherever the focus is (the opener, a cell), Esc closes the card and nothing else.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={card}
      className={styles.card}
      role="dialog"
      aria-label={label}
      style={position ?? { visibility: 'hidden' }}
    >
      {children}
    </div>
  );
}
