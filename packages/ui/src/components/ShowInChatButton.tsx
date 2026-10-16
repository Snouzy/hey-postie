import { MessageSquareText } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import { cn } from '../lib/cn';
import { Button } from './Button';

interface ShowInChatButtonProps {
  onClick: () => void;
  className?: string;
}

/** An item of the archive: its letter, brought into view in the conversation. */
export function ShowInChatButton({ onClick, className }: ShowInChatButtonProps) {
  const text = useText();
  return (
    <Button
      variant="ghost"
      className={cn('shrink-0 p-1', className)}
      onClick={onClick}
      aria-label={text('archive.showInChat')}
      title={text('archive.showInChat')}
    >
      <MessageSquareText size={16} aria-hidden />
    </Button>
  );
}
