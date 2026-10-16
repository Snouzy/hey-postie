import { CornerUpLeft, Pencil, X } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';

const BANNER =
  'm-0 flex items-center gap-2 rounded-sm bg-kraft-soft px-3 py-1 text-[13px] text-ink';

interface ComposerBannerProps {
  /** A correction under way: it comes first, the reply waits. */
  editing: boolean;
  onCancelEdit: () => void;
  /** The letter being answered: who wrote it and a line of it. */
  replying?: { name: string; self: boolean; excerpt: string } | undefined;
  onCancelReply: () => void;
}

/** Above the composer: "Editing a letter" or "Replying to Bob" with a line of his letter. */
export function ComposerBanner({
  editing,
  onCancelEdit,
  replying,
  onCancelReply,
}: ComposerBannerProps) {
  const text = useText();
  if (editing) {
    return (
      <p className={BANNER}>
        <Pencil size={14} className="shrink-0" aria-hidden />
        <span className="flex-1">{text('composer.editing')}</span>
        <Button
          variant="ghost"
          className="px-2 py-[2px] text-[13px] leading-[1.3]"
          onClick={onCancelEdit}
        >
          {text('composer.cancelEdit')}
        </Button>
      </p>
    );
  }
  if (!replying) return null;
  return (
    <div className={BANNER}>
      <CornerUpLeft size={14} className="shrink-0" aria-hidden />
      <p className="m-0 flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">
          {replying.self
            ? text('composer.replyingToSelf')
            : text('composer.replyingTo').replace('{name}', replying.name)}
        </span>
        {replying.excerpt && <span className="truncate text-ink-muted">{replying.excerpt}</span>}
      </p>
      <Button
        variant="ghost"
        className="size-7 shrink-0 p-0"
        aria-label={text('composer.cancelReply')}
        title={text('composer.cancelReply')}
        onClick={onCancelReply}
      >
        <X size={14} aria-hidden />
      </Button>
    </div>
  );
}
