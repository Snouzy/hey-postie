import { Send, Smile } from 'lucide-react';
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useText } from '../core/CoreProvider';
import { readDraft, writeDraft } from '../core/drafts';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { AttachButton } from './AttachButton';
import { Button } from './Button';
import { ComposerBanner } from './ComposerBanner';
import { ComposerSuggestions } from './ComposerSuggestions';
import { grow, insertAt, pastedImages } from './composerText';
import { EmojiPicker } from './EmojiPicker';
import { completeNick, type MentionCandidate } from './mentions';
import { useComposerCompletions } from './useComposerCompletions';

const AREA =
  'max-h-[200px] flex-1 resize-none rounded border border-line-strong bg-paper-raised px-3 py-2 leading-[1.4] text-ink transition-[border-color] duration-(--motion-fast) focus-visible:border-navy';
// Paperclip and smile: the same footprint as the send button, so the row stays level.
const TOOL = 'size-10 shrink-0';

interface ComposerProps {
  /** The chat written to: its draft is kept for the session when the user goes elsewhere. */
  chatId: string;
  onSend: (body: string) => Promise<void>;
  /** Files picked with the attach button or pasted from the clipboard: they leave as parcels. */
  onAttach?: (files: File[]) => void;
  /** In a hall: the people `@` lists and Tab completes (not me). */
  people?: MentionCandidate[];
  /** Nothing can be written (a hall the user is not in). */
  disabled?: boolean;
  /** The letters of this chat leave sealed: the hint says so. */
  sealed?: boolean;
  /** True on every keystroke with text, false once the draft is empty or sent (XEP-0085). */
  onComposing?: (composing: boolean) => void;
  /** A letter Claude prepared: added to the text (below what is there), then `onDraftTaken`. */
  draft?: string | undefined;
  onDraftTaken?: (() => void) | undefined;
  /** A letter of mine being corrected: its text fills the field, Enter saves, Esc cancels. */
  editing?: { id: string; body: string } | undefined;
  onCancelEdit?: (() => void) | undefined;
  /** ↑ in an empty field: the conversation picks my last letter to correct. */
  onEditLast?: (() => void) | undefined;
  /** The letter being answered: a banner above the field; X or Esc cancels. */
  replying?: { id: string; name: string; self: boolean; excerpt: string } | undefined;
  onCancelReply?: (() => void) | undefined;
}

/**
 * Enter sends, Shift+Enter breaks the line. The textarea grows with the text. In a hall, `@` lists
 * the members and Tab completes the word before the caret into `@nick`; `:sm` offers emojis. The paperclip
 * picks files, the smile opens the emoji picker, a pasted image leaves as a parcel. What is typed
 * is the chat's draft (`core/drafts.ts`), except the text of a letter being corrected.
 */
export function Composer({
  chatId,
  onSend,
  onAttach,
  people = [],
  disabled = false,
  sealed = false,
  onComposing,
  draft,
  onDraftTaken,
  editing,
  onCancelEdit,
  onEditLast,
  replying,
  onCancelReply,
}: ComposerProps) {
  const text = useText();
  const placeholder = text(sealed ? 'composer.placeholderSealed' : 'composer.placeholder');
  const [body, setBody] = useState(() => readDraft(chatId));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const [caret, setCaret] = useState(0);
  const canSend = body.trim().length > 0 && !sending && !disabled;
  const completions = useComposerCompletions(body, caret, people, replace);

  // A draft brought back from another visit: the field takes its height at once.
  useLayoutEffect(() => {
    if (area.current) grow(area.current);
  }, []);

  /** The text changes: it is the chat's draft, unless it is a correction under way. */
  function write(next: string) {
    setBody(next);
    if (!editing) writeDraft(chatId, next);
  }

  // A correction starts from the letter's text, with the caret at its end.
  const editingId = editing?.id;
  const editingBody = editing?.body;
  useEffect(() => {
    if (editingId === undefined || editingBody === undefined) return;
    setBody(editingBody);
    requestAnimationFrame(() => {
      if (!area.current) return;
      area.current.focus({ preventScroll: true });
      area.current.setSelectionRange(editingBody.length, editingBody.length);
      grow(area.current);
    });
  }, [editingId, editingBody]);

  // Answering a letter: the field takes the focus, the text stays.
  const replyingId = replying?.id;
  useEffect(() => {
    if (replyingId !== undefined) area.current?.focus({ preventScroll: true });
  }, [replyingId]);

  /** Back to the draft that was there before the correction. */
  function cancelEdit() {
    restoreDraft();
    onCancelEdit?.();
  }

  function restoreDraft() {
    setBody(readDraft(chatId));
    requestAnimationFrame(() => area.current && grow(area.current));
  }

  // Claude's draft joins what the user already wrote, never replaces it; the user sends it. During
  // a correction it waits in the chat's draft, which comes back once the correction is done.
  useEffect(() => {
    if (draft === undefined) return;
    onDraftTaken?.();
    const current = readDraft(chatId);
    const next = current.trim() ? `${current}\n${draft}` : draft;
    writeDraft(chatId, next);
    if (editingId !== undefined) return;
    setBody(next);
    requestAnimationFrame(() => {
      if (!area.current) return;
      area.current.focus({ preventScroll: true });
      grow(area.current);
    });
  }, [draft, onDraftTaken, chatId, editingId]);

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const correcting = editing !== undefined;
    try {
      await onSend(body.trim());
      onComposing?.(false);
      // A correction saved: the draft written before it comes back. A letter sent: it was the draft.
      if (!correcting) writeDraft(chatId, '');
      restoreDraft();
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
    write(next.body);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      if (!area.current) return;
      area.current.setSelectionRange(next.caret, next.caret);
      grow(area.current);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (completions.onKeyDown(event)) return;
    // While an IME composes (Japanese, Chinese...), Enter confirms the candidate, not the letter.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    } else if (event.key === 'Escape' && editing) {
      event.preventDefault();
      cancelEdit();
    } else if (event.key === 'Escape' && replying) {
      // Esc cancels the reply only: the details pane stays.
      event.preventDefault();
      event.stopPropagation();
      onCancelReply?.();
    } else if (event.key === 'ArrowUp' && !body && !editing && onEditLast) {
      event.preventDefault();
      onEditLast();
    } else if (event.key === 'Tab' && !event.shiftKey) {
      const nicks = people.map((person) => person.nick);
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
      <ComposerBanner
        editing={editing !== undefined}
        onCancelEdit={cancelEdit}
        replying={replying}
        onCancelReply={() => onCancelReply?.()}
      />
      {error && (
        <p
          className="m-0 font-heading text-[14px] text-red [font-variation-settings:'SOFT'_100]"
          role="alert"
        >
          {text(error)}
        </p>
      )}
      {/* `relative`: the emoji and member matches float above the row. */}
      <div className="relative flex items-end gap-2">
        <ComposerSuggestions {...completions} />
        {onAttach && <AttachButton className={TOOL} disabled={disabled} onAttach={onAttach} />}
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
            write(event.target.value);
            setCaret(event.target.selectionStart);
            onComposing?.(event.target.value.length > 0);
            grow(event.target);
          }}
          onKeyDown={onKeyDown}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onPaste={onPaste}
          {...completions.fieldProps}
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
