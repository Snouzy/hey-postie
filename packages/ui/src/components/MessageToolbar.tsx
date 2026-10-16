import type { Message } from '@hey-postie/core';
import { CornerUpLeft } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import { recordEmojiUse } from '../core/settings';
import type { Emoji } from '../data/emoji';
import { cn } from '../lib/cn';
import { Button } from './Button';
import { type MessageAction, MessageActions } from './MessageActions';
import { SHOWN_ON_HOVER } from './messageParts';
import { QuickReactions } from './QuickReactions';
import { ReactionBar } from './ReactionBar';

// `z-float`: above the letter's own positioned parts (its reply quote, its pictures), which come
// after the toolbar in the page and would otherwise be drawn over it.
// One pill holding every button (Slack's way), 34px tall: placed by the caller so that it overlaps
// only the letter's padding, never its text.
const TOOLS = `absolute z-float flex items-center gap-[2px] whitespace-nowrap rounded-sm border border-line bg-paper-raised p-[2px] shadow-card ${SHOWN_ON_HOVER}`;
const TOOL = 'size-7 border-none p-0';

interface MessageToolbarProps {
  message: Message;
  /** What the letter offers in its "⋯" menu (`actionsFor`). */
  actions: MessageAction[];
  quickEmojis: Emoji[];
  onReact: (message: Message, emoji: string) => void;
  onAction?: ((message: Message, action: MessageAction) => void) | undefined;
  /** Where it floats, set by the layout. */
  className: string;
}

/**
 * The hover toolbar of a letter, in both layouts: quick emojis, React, Reply where the user can
 * write, then the "⋯" menu. Shown on hover or focus of the letter (`group/letter`).
 */
export function MessageToolbar({
  message,
  actions,
  quickEmojis,
  onReact,
  onAction,
  className,
}: MessageToolbarProps) {
  const text = useText();

  /** A reaction from the toolbar counts toward the viewer's favourites. */
  function reactFromToolbar(emoji: string) {
    recordEmojiUse(emoji);
    onReact(message, emoji);
  }

  return (
    <div className={cn(TOOLS, className)} data-toolbar="">
      <QuickReactions emojis={quickEmojis} onReact={reactFromToolbar} />
      <ReactionBar onReact={reactFromToolbar} />
      {onAction && actions.includes('reply') && (
        <Button
          variant="ghost"
          className={TOOL}
          aria-label={text('message.action.reply')}
          title={text('message.action.reply')}
          onClick={() => onAction(message, 'reply')}
        >
          <CornerUpLeft size={16} aria-hidden />
        </Button>
      )}
      {onAction && (
        <MessageActions actions={actions} onPick={(action) => onAction(message, action)} />
      )}
    </div>
  );
}
