import { X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import styles from './Dialog.module.css';

interface DialogProps {
  title: string;
  onClose: () => void;
  /** False while an action is in flight: Esc and the X are ignored. Default true. */
  closable?: boolean;
  /** `large`: a window-like card (the settings), its children lay out the inside. Default small. */
  size?: 'small' | 'large';
  children: ReactNode;
}

const FOCUSABLE = 'input, textarea, button, a[href], [tabindex]';

/**
 * A modal card. Focus starts on the element marked `data-autofocus`, else in the first field,
 * else on the card; Tab cycles inside it, Esc or the close button closes it and focus goes back
 * to whatever opened it.
 */
export function Dialog({ title, onClose, closable = true, size = 'small', children }: DialogProps) {
  const text = useText();
  const titleId = useId();
  const card = useRef<HTMLDivElement>(null);

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
    <div className={styles.backdrop}>
      <div
        ref={card}
        className={size === 'large' ? `${styles.card} ${styles.large}` : styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={cycleFocus}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
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
