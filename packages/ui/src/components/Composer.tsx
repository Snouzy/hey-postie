import { Paperclip, Send, Smile } from 'lucide-react';
import { type ClipboardEvent, type KeyboardEvent, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import styles from './Composer.module.css';
import { completeNick, grow, insertAt, pastedImages } from './composerText';
import { EmojiPicker } from './EmojiPicker';

interface ComposerProps {
  onSend: (body: string) => Promise<void>;
  /** Files picked with the attach button or pasted from the clipboard: they leave as parcels. */
  onAttach?: (files: File[]) => void;
  /** In a hall: the nicks Tab can complete. */
  nicks?: string[];
  /** Nothing can be written (a hall the user is not in). */
  disabled?: boolean;
  /** The letters of this chat leave sealed: the hint says so. */
  sealed?: boolean;
  /** True on every keystroke with text, false once the draft is empty or sent (XEP-0085). */
  onComposing?: (composing: boolean) => void;
}

/**
 * Enter sends, Shift+Enter breaks the line. The textarea grows with the text. In a hall, Tab
 * completes the word before the caret into a member's nick. The paperclip picks files, the smile
 * opens the emoji picker, a pasted image leaves as a parcel.
 */
export function Composer({
  onSend,
  onAttach,
  nicks = [],
  disabled = false,
  sealed = false,
  onComposing,
}: ComposerProps) {
  const text = useText();
  const placeholder = text(sealed ? 'composer.placeholderSealed' : 'composer.placeholder');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const canSend = body.trim().length > 0 && !sending && !disabled;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body.trim());
      setBody('');
      onComposing?.(false);
      if (area.current) area.current.style.height = 'auto';
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setSending(false);
      // Already on screen: a focus that scrolled an ancestor would shift the whole column.
      area.current?.focus({ preventScroll: true });
    }
  }

  /** Writes the new text and puts the caret where React will have left it. */
  function replace(next: { body: string; caret: number }) {
    setBody(next.body);
    requestAnimationFrame(() => {
      if (!area.current) return;
      area.current.setSelectionRange(next.caret, next.caret);
      grow(area.current);
    });
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
      replace(completed);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = pastedImages(event.clipboardData);
    if (images.length === 0 || !onAttach) return;
    // A screenshot alone leaves as a parcel; text that came with it still lands in the letter.
    if (!event.clipboardData.getData('text')) event.preventDefault();
    onAttach(images);
  }

  function pickEmoji(emoji: string) {
    const element = area.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? body.length;
    replace(insertAt(body, start, end, emoji));
    setPickerOpen(false);
    element?.focus({ preventScroll: true });
  }

  function closePicker() {
    setPickerOpen(false);
    emojiButton.current?.focus({ preventScroll: true });
  }

  return (
    <div className={styles.composer}>
      {error && (
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
      <div className={styles.row}>
        {onAttach && (
          <>
            <input
              ref={fileInput}
              className={styles.fileInput}
              type="file"
              multiple
              // The paperclip is the Tab stop; the input stays in the tree for its own name.
              tabIndex={-1}
              aria-label={text('composer.attach')}
              disabled={disabled}
              onChange={(event) => {
                onAttach([...(event.target.files ?? [])]);
                event.target.value = '';
              }}
            />
            <Button
              variant="ghost"
              className={styles.tool}
              aria-label={text('composer.attach')}
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={18} aria-hidden />
            </Button>
          </>
        )}
        <Button
          ref={emojiButton}
          variant="ghost"
          className={styles.tool}
          aria-label={text('composer.emoji')}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          disabled={disabled}
          onClick={() => setPickerOpen((open) => !open)}
        >
          <Smile size={18} aria-hidden />
        </Button>
        {pickerOpen && (
          <EmojiPicker anchor={emojiButton.current} onPick={pickEmoji} onClose={closePicker} />
        )}
        <textarea
          ref={area}
          className={styles.area}
          rows={1}
          value={body}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            setBody(event.target.value);
            onComposing?.(event.target.value.length > 0);
            grow(event.target);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
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
