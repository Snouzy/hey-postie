import { useText } from '../core/CoreProvider';

/**
 * The "New" line above the first letter that was unread when the chat opened (spec 2026-10-17,
 * Lot B item 8): mailbox red, the way a reader's eye finds where they left off.
 */
export function NewDivider() {
  const text = useText();
  return (
    <div className="mt-2 flex items-center gap-2 text-red" data-new-divider="">
      {/* The line itself is the separator screen readers announce, with its sentence. */}
      <hr
        className="m-0 h-px flex-1 border-0 bg-current"
        aria-label={text('conversation.newDivider')}
      />
      <span className="text-[12px] font-semibold tracking-[0.04em] uppercase" aria-hidden>
        {text('conversation.new')}
      </span>
      <span className="h-px flex-1 bg-current" />
    </div>
  );
}
