import { Send } from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import styles from './Composer.module.css';

interface ComposerProps {
  onSend: (body: string) => Promise<void>;
  /** In a hall: the nicks Tab can complete. */
  nicks?: string[];
  /** Nothing can be written (a hall the user is not in). */
  disabled?: boolean;
  /** The letters of this chat leave sealed: the hint says so. */
  sealed?: boolean;
}

/**
 * Enter sends, Shift+Enter breaks the line. The textarea grows with the text. In a hall, Tab
 * completes the word before the caret into a member's nick.
 */
export function Composer({ onSend, nicks = [], disabled = false, sealed = false }: ComposerProps) {
  const text = useText();
  const placeholder = text(sealed ? 'composer.placeholderSealed' : 'composer.placeholder');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const canSend = body.trim().length > 0 && !sending && !disabled;

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
    // While an IME composes (Japanese, Chinese...), Enter confirms the candidate, not the letter.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    } else if (event.key === 'Tab' && !event.shiftKey) {
      const completed = completeNick(body, event.currentTarget.selectionStart, nicks);
      if (!completed) return;
      event.preventDefault();
      setBody(completed.body);
      // The caret lands after the nick once React has written the new value.
      requestAnimationFrame(() => {
        if (!area.current) return;
        area.current.setSelectionRange(completed.caret, completed.caret);
        grow(area.current);
      });
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
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            setBody(event.target.value);
            grow(event.target);
          }}
          onKeyDown={onKeyDown}
          disabled={sending || disabled}
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

/**
 * The word before the caret, completed into the nick it equals, else the first nick that starts
 * with it (ignoring case): `nick: ` at the start of a line, `nick ` elsewhere (no second space
 * when one follows already). Nothing to complete returns null.
 */
export function completeNick(
  body: string,
  caret: number,
  nicks: string[],
): { body: string; caret: number } | null {
  const before = body.slice(0, caret);
  const word = before.match(/\S+$/)?.[0];
  if (!word) return null;
  const lower = word.toLowerCase();
  const nick =
    nicks.find((candidate) => candidate.toLowerCase() === lower) ??
    nicks.find((candidate) => candidate.toLowerCase().startsWith(lower));
  if (!nick) return null;
  const start = caret - word.length;
  const atLineStart = start === 0 || before[start - 1] === '\n';
  const inserted = atLineStart ? `${nick}:` : nick;
  const completed = body[caret] === ' ' ? inserted : `${inserted} `;
  return {
    body: before.slice(0, start) + completed + body.slice(caret),
    caret: start + completed.length,
  };
}

// Shrink first so that deleted lines give their room back.
function grow(element: HTMLTextAreaElement) {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}
