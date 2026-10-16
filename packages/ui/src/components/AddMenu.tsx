import { type LucideIcon, Plus } from 'lucide-react';
import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';

const MENU =
  'absolute top-[calc(100%+var(--space-1))] right-0 z-float flex w-max min-w-[180px] flex-col rounded-sm border border-line bg-paper-raised p-1 shadow-card';
const ITEM =
  'flex w-full cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent px-3 py-2 text-left text-ink transition-[background-color] duration-(--motion-fast) hover:bg-paper focus-visible:bg-paper whitespace-nowrap';

export interface AddMenuItem {
  label: string;
  icon: LucideIcon;
  action: () => void;
}

interface AddMenuProps {
  /** The name of the "+" and of its menu. */
  label: string;
  items: AddMenuItem[];
  /** `small`: the 24px "+" of a sidebar group heading. Default: the 40px one beside the search. */
  size?: 'small' | 'default';
  /** Extra classes on the "+" (a group heading shows it on hover or focus only). */
  className?: string;
}

/**
 * A "+" and its small menu of ways to start something: the sidebar's (new chat, create or join a
 * hall, add a contact) and the Halls heading's (create or join a hall). Arrow keys move between
 * the items, Esc or a click outside closes it, focus goes back to the "+".
 */
export function AddMenu({ label, items, size = 'default', className }: AddMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  // The "+" takes the focus back first, so the dialog that opens knows it as its opener.
  function pick(action: () => void) {
    trigger.current?.focus();
    setOpen(false);
    action();
  }

  // A blur without relatedTarget is not a Tab out: WebKit (the Tauri webview on macOS) does not
  // focus a button on mousedown, so a click on an item blurs the menu to nowhere first; closing
  // here would unmount the item before its click. A click outside is heard on pointerdown.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && !root.current?.contains(next)) setOpen(false);
  }

  // Focus is inside the menu while it is open, so the menu itself hears the keys.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  }

  return (
    <div ref={root} className="relative">
      <Button
        ref={trigger}
        variant="ghost"
        className={cn(size === 'small' && 'size-6 p-0', className)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={size === 'small' ? 16 : 18} aria-hidden />
      </Button>
      {open && (
        <div
          id={menuId}
          className={MENU}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        >
          {items.map(({ label, icon: Icon, action }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={() => pick(action)}
            >
              <Icon size={16} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
