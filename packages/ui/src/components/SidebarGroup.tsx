import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { readFoldedGroups, writeFoldedGroup } from '../core/settings';
import { cn } from '../lib/cn';

/** The uppercase heading of the address book, as a button that folds its group. */
export const GROUP_HEADING =
  'flex w-full cursor-pointer items-center gap-1 rounded-sm border-none bg-transparent px-3 py-2 text-left font-text text-[12px] font-bold tracking-[0.04em] text-ink-muted uppercase hover:bg-fill-hover';
/** A count on stamp yellow: something at the door is worth a look. */
export const GROUP_BADGE =
  'min-w-5 shrink-0 rounded-full bg-yellow px-[6px] py-0 text-center text-[12px] leading-[20px] font-bold tracking-normal text-on-yellow';
/** A two-line row without an avatar (a stranger at the door, an invitation): name, then a preview. */
export const GROUP_ROW =
  'flex w-full cursor-pointer flex-col gap-[2px] rounded-sm border-none bg-transparent px-3 py-2 text-left text-ink transition-[background-color] duration-(--motion-fast) hover:bg-fill-hover aria-[current=true]:bg-fill-chosen';

interface SidebarGroupProps {
  /** Stable name, the key of its folded state in the viewer's storage. */
  id: 'invitations' | 'halls' | 'letters';
  title: string;
  /** A count on stamp yellow after the title, with its hidden word ("waiting"). */
  count?: { value: number; label: string };
  /** A control beside the heading (the "+" of the halls), shown on hover or focus. */
  action?: ReactNode;
  /**
   * What waits inside, shown only while the group is folded, so that nothing is missed: the chats
   * with unread letters as a muted count, on stamp yellow when someone mentioned the user.
   */
  folded?: { unread: number; mentions: number; label: string };
  children: ReactNode;
}

/**
 * One foldable group of the Chats tab: an `h3` holding the heading button (`aria-expanded`, the
 * chevron, the count), an optional action beside it, then its rows. Open by default; whether the
 * viewer folded it is kept per window (`core/settings.ts`).
 */
export function SidebarGroup({ id, title, count, action, folded, children }: SidebarGroupProps) {
  const headingId = useId();
  const [open, setOpen] = useState(() => !readFoldedGroups().includes(id));
  const Chevron = open ? ChevronDown : ChevronRight;

  function toggle() {
    writeFoldedGroup(id, open);
    setOpen(!open);
  }

  return (
    // Named by its title alone (not the count). The rows bring their own side padding.
    <section className="pt-0 pb-2" aria-labelledby={headingId}>
      <div className="group/heading flex items-center gap-1 px-2">
        <h3 className="m-0 min-w-0 flex-1">
          <button type="button" className={GROUP_HEADING} aria-expanded={open} onClick={toggle}>
            <Chevron size={14} aria-hidden />
            <span id={headingId} className="flex-1 truncate">
              {title}
            </span>
            {!open && folded && folded.unread > 0 && (
              <span className={cn(GROUP_BADGE, folded.mentions === 0 && 'bg-line text-ink')}>
                {folded.unread}
                <span className="sr-only"> {folded.label}</span>
              </span>
            )}
            {count && count.value > 0 && (
              <span className={GROUP_BADGE}>
                {count.value}
                <span className="sr-only"> {count.label}</span>
              </span>
            )}
          </button>
        </h3>
        {action}
      </div>
      {open && children}
    </section>
  );
}
