import { X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { cn } from '../lib/cn';
import { Button } from './Button';

interface DialogProps {
  title: string;
  onClose: () => void;
  /** False while an action is in flight: Esc and the X are ignored. Default true. */
  closable?: boolean;
  /**
   * `medium` (480px): a form with a few groups (create a hall, invite people). `large`: a
   * window-like card (the settings), its children lay out the inside. Default small (400px).
   */
  size?: 'small' | 'medium' | 'large';
  children: ReactNode;
}

// Above the sticky day chips of the conversation behind it.
const BACKDROP =
  'fixed inset-0 z-dialog flex items-center justify-center bg-[rgb(0_0_0/0.35)] animate-[dialog-fade_var(--motion)_ease-out]';
const CARD =
  'flex max-h-[calc(100%_-_var(--space-8))] w-[min(400px,calc(100%_-_var(--space-8)))] flex-col gap-4 overflow-y-auto rounded bg-paper-raised p-6 shadow-card';
const MEDIUM = 'w-[min(480px,calc(100%_-_var(--space-8)))]';
// A window inside the window: as wide as the settings need, never past the minimum window size.
const LARGE =
  'h-[min(640px,calc(100%_-_var(--space-8)))] w-[min(880px,calc(100%_-_var(--space-8)))]';

const FOCUSABLE = 'input, textarea, select, button, a[href], [tabindex]';

/**
 * A modal card. Focus starts on the element marked `data-autofocus`, else in the first field,
 * else on the card; Tab cycles inside it, Esc or the close button closes it and focus goes back
 * to whatever opened it. Everything outside the card is `inert` while it is open, so a screen
 * reader's cursor cannot wander behind it either.
 */
export function Dialog({ title, onClose, closable = true, size = 'small', children }: DialogProps) {
  const text = useText();
  const titleId = useId();
  const card = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => (backdrop.current ? inertOutside(backdrop.current) : undefined), []);

  useEffect(() => {
    const opener = document.activeElement;
    const first =
      card.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      card.current?.querySelector<HTMLElement>('input, textarea') ??
      card.current;
    first?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // Capture phase, and the event stops here: Esc closes this dialog only, not the pane behind it.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (closable) onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, closable]);

  function cycleFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !card.current) return;
    const controls = [...card.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => !element.hasAttribute('disabled') && element.tabIndex >= 0,
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div ref={backdrop} className={BACKDROP}>
      <div
        ref={card}
        className={cn(CARD, size === 'medium' && MEDIUM, size === 'large' && LARGE)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={cycleFocus}
      >
        <header className="flex items-center justify-between">
          <h2 id={titleId} className="text-[22px]">
            {title}
          </h2>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={!closable}
            aria-label={text('dialog.close')}
          >
            <X size={18} aria-hidden />
          </Button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Marks every sibling on the way up to `body` as `inert`; returns the undo. */
function inertOutside(element: HTMLElement): () => void {
  const marked: Element[] = [];
  for (
    let node: HTMLElement | null = element;
    node && node !== document.body;
    node = node.parentElement
  ) {
    for (const sibling of node.parentElement?.children ?? []) {
      if (sibling !== node && !sibling.hasAttribute('inert')) {
        sibling.setAttribute('inert', '');
        marked.push(sibling);
      }
    }
  }
  return () => {
    for (const sibling of marked) sibling.removeAttribute('inert');
  };
}
