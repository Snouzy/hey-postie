import { Smile } from 'lucide-react';
import { useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import { EmojiPicker } from './EmojiPicker';

interface EmojiButtonProps {
  className: string;
  disabled: boolean;
  /** The picker has closed; the caller puts the emoji where it belongs and moves the focus. */
  onPick: (emoji: string) => void;
}

/** The composer's smile: opens the emoji picker; closed without a pick, the focus comes back here. */
export function EmojiButton({ className, disabled, onPick }: EmojiButtonProps) {
  const text = useText();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <Button
        ref={button}
        variant="ghost"
        className={className}
        aria-label={text('composer.emoji')}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <Smile size={18} aria-hidden />
      </Button>
      {open && (
        <EmojiPicker
          anchor={button.current}
          onPick={(emoji) => {
            setOpen(false);
            onPick(emoji);
          }}
          onClose={close}
        />
      )}
    </>
  );
}
