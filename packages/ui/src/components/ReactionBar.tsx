import { SmilePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { QUICK_EMOJIS } from '../data/emoji';
import { Button } from './Button';
import { EmojiPicker } from './EmojiPicker';
import { Popover } from './Popover';
import styles from './ReactionBar.module.css';

interface ReactionBarProps {
  onReact: (emoji: string) => void;
}

/**
 * The "React" button of a bubble's hover toolbar: a quick row of six, and "More emojis" for the
 * whole picker. Picking closes the popover and gives the focus back to the button.
 */
export function ReactionBar({ onReact }: ReactionBarProps) {
  const text = useText();
  const [open, setOpen] = useState<'quick' | 'picker' | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(null);
    trigger.current?.focus();
  }

  function pick(emoji: string) {
    onReact(emoji);
    close();
  }

  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        className={styles.trigger}
        aria-label={text('reaction.add')}
        aria-haspopup="dialog"
        aria-expanded={open !== null}
        onClick={() => setOpen(open ? null : 'quick')}
      >
        <SmilePlus size={16} aria-hidden />
      </Button>
      {open === 'quick' && (
        <Popover anchor={trigger.current} label={text('reaction.add')} onClose={close}>
          <div className={styles.quick}>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.emoji}
                onClick={() => pick(emoji)}
              >
                {emoji}
              </button>
            ))}
            <Button
              variant="ghost"
              className={styles.more}
              aria-label={text('reaction.more')}
              onClick={() => setOpen('picker')}
            >
              <SmilePlus size={16} aria-hidden />
            </Button>
          </div>
        </Popover>
      )}
      {open === 'picker' && <EmojiPicker anchor={trigger.current} onPick={pick} onClose={close} />}
    </>
  );
}
