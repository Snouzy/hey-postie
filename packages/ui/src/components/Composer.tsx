import { Paperclip, Send, Smile } from 'lucide-react';
import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { completeNick, grow, insertAt, pastedImages } from './composerText';
import { EmojiPicker } from './EmojiPicker';

const AREA =
  'max-h-[200px] flex-1 resize-none rounded border border-line-strong bg-paper-raised px-3 py-2 leading-[1.4] text-ink transition-[border-color] duration-(--motion-fast) focus-visible:border-navy';
// Paperclip and smile: the same footprint as the send button, so the row stays level.
const TOOL = 'size-10 shrink-0';
// The real file input stays in the accessibility tree; the paperclip is its visible face.
const FILE_INPUT = 'absolute h-px w-px overflow-hidden [clip:rect(0_0_0_0)]';

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
  /** A letter Claude prepared: added to the text (below what is there), then `onDraftTaken`. */
  draft?: string | undefined;
  onDraftTaken?: (() => void) | undefined;
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
  draft,
  onDraftTaken,
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

  // Claude's draft joins what the user already wrote, never replaces it; the user sends it.
  useEffect(() => {
    if (draft === undefined) return;
    onDraftTaken?.();
    setBody((current) => (current.trim() ? `${current}\n${draft}` : draft));
    requestAnimationFrame(() => {
      if (!area.current) return;
      area.current.focus({ preventScroll: true });
      grow(area.current);
    });
  }, [draft, onDraftTaken]);

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
    <div className="flex flex-col gap-2 border-t border-line bg-paper px-4 py-3">
      {error && (
        <p
          className="m-0 font-heading text-[14px] text-red [font-variation-settings:'SOFT'_100]"
          role="alert"
        >
          {text(error)}
        </p>
      )}
      <div className="flex items-end gap-2">
        {onAttach && (
          <>
            <input
              ref={fileInput}
              className={FILE_INPUT}
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
              className={TOOL}
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
          className={TOOL}
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
          className={AREA}
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
          className="size-10 p-2"
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
