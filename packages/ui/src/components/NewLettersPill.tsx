import { ArrowDown } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import { cn } from '../lib/cn';
import { Button } from './Button';

// `leading-[1.3]` again: cn drops the button's line height when a text size is given.
const PILL = 'pointer-events-auto px-3 py-1 text-[13px] leading-[1.3] shadow-card';

/**
 * At the bottom of a list scrolled up: "3 new letters ↓" in navy while letters wait below, else a
 * quiet "Jump to the latest". Either brings the reader down.
 */
export function NewLettersPill({ unseen, onClick }: { unseen: number; onClick: () => void }) {
  const text = useText();
  const label =
    unseen === 0
      ? text('conversation.jumpToLatest')
      : unseen === 1
        ? text('conversation.newLetter')
        : text('conversation.newLetters').replace('{count}', String(unseen));
  return (
    <Button
      variant={unseen > 0 ? 'primary' : 'secondary'}
      className={cn(PILL, unseen === 0 && 'bg-paper-raised')}
      onClick={onClick}
    >
      <ArrowDown size={16} aria-hidden />
      {label}
    </Button>
  );
}
