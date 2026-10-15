import { Send } from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import styles from './Composer.module.css';

interface ComposerProps {
  onSend: (body: string) => Promise<void>;
}

/** Enter sends, Shift+Enter breaks the line. The textarea grows with the text. */
export function Composer({ onSend }: ComposerProps) {
  const text = useText();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const canSend = body.trim().length > 0 && !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body.trim());
      setBody('');
      if (area.current) area.current.style.height = 'auto';
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setSending(false);
      area.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className={styles.composer}>
      {error && (
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
      <div className={styles.row}>
        <textarea
          ref={area}
          className={styles.area}
          rows={1}
          value={body}
          placeholder={text('composer.placeholder')}
          aria-label={text('composer.placeholder')}
          onChange={(event) => {
            setBody(event.target.value);
            grow(event.target);
          }}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <Button
          variant="primary"
          className={styles.send}
          onClick={() => void send()}
          disabled={!canSend}
          aria-label={text('composer.send')}
        >
          <Send size={18} aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// Shrink first so that deleted lines give their room back.
function grow(element: HTMLTextAreaElement) {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}
