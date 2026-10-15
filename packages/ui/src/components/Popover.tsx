import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
 * list), so a message list or a composer never clips it.
 */
export function Popover({ anchor, label, onClose, children }: PopoverProps) {
  const card = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const element = card.current;
    if (!element || !anchor) return;
    const at = anchor.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const above = at.top - height - MARGIN;
    const top = above >= MARGIN ? above : Math.min(at.bottom + MARGIN, window.innerHeight - height);
    const left = Math.max(MARGIN, Math.min(at.left, window.innerWidth - width - MARGIN));
    setPosition({ top: Math.max(MARGIN, top), left });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!card.current?.contains(target) && !anchor?.contains(target)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [anchor, onClose]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  return (
    <div
      ref={card}
      className={styles.card}
      role="dialog"
      aria-label={label}
      style={position ?? { visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
