import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import styles from './Dialog.module.css';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A small modal card. Esc or the close button closes it; focus lands on its first field. */
export function Dialog({ title, onClose, children }: DialogProps) {
  const text = useText();
  const titleId = useId();
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    card.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.backdrop}>
      <div
        ref={card}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
