import { X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import styles from './Dialog.module.css';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = 'input, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * A small modal card. Focus starts in its first field, Tab cycles inside it, Esc or the close
 * button closes it and focus goes back to whatever opened it.
 */
export function Dialog({ title, onClose, children }: DialogProps) {
  const text = useText();
  const titleId = useId();
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    const first = card.current?.querySelector<HTMLElement>('input, textarea') ?? card.current;
    first?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function cycleFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !card.current) return;
    const controls = [...card.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => !element.hasAttribute('disabled'),
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
        className={styles.card}
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
          <Button variant="ghost" onClick={onClose} aria-label={text('dialog.close')}>
            <X size={18} aria-hidden />
          </Button>
        </header>
        {children}
      </div>
    </div>
  );
}
