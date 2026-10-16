import { SmilePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { QUICK_EMOJIS } from '../data/emoji';
import { Button } from './Button';
import { EmojiPicker } from './EmojiPicker';
import { Popover } from './Popover';

const EMOJI =
  'size-8 cursor-pointer rounded-sm border-none bg-transparent text-[20px] leading-none hover:bg-paper focus-visible:bg-paper';

interface ReactionBarProps {
  onReact: (emoji: string) => void;
}

/**
 * The "React" button of a bubble's hover toolbar: a quick row of six, and "More emojis" for the
 * whole picker. The first quick emoji takes the focus; picking closes the popover and gives the
 * focus back to the button.
 */
export function ReactionBar({ onReact }: ReactionBarProps) {
  const text = useText();
  const [open, setOpen] = useState<'quick' | 'picker' | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const quick = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === 'quick') quick.current?.querySelector('button')?.focus();
  }, [open]);

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
        className="border border-line bg-paper-raised p-1 shadow-card"
        aria-label={text('reaction.add')}
        aria-haspopup="dialog"
        aria-expanded={open !== null}
        onClick={() => setOpen(open ? null : 'quick')}
      >
        <SmilePlus size={16} aria-hidden />
      </Button>
      {open === 'quick' && (
        <Popover anchor={trigger.current} label={text('reaction.add')} onClose={close}>
          <div ref={quick} className="flex items-center gap-[2px]">
            {QUICK_EMOJIS.map((entry) => (
              <button
                key={entry.shortname}
                type="button"
                className={EMOJI}
                aria-label={entry.shortname}
                title={entry.shortname}
                onClick={() => pick(entry.emoji)}
              >
                {entry.emoji}
              </button>
            ))}
            <Button
              variant="ghost"
              className="p-1"
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
