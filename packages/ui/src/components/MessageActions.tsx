import type { Message } from '@hey-postie/core';
import { Copy, CornerUpLeft, Ellipsis, EyeOff, Gavel, Pencil, Trash2 } from 'lucide-react';
import { type FocusEvent, useEffect, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import { Popover } from './Popover';

/** What the user can do with a letter from its hover toolbar. */
export type MessageAction =
  | 'reply'
  | 'copy'
  | 'edit'
  | 'deleteForMe'
  | 'deleteForEveryone'
  | 'moderate';

const ITEM =
  'flex cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent p-2 text-left whitespace-nowrap text-ink hover:bg-paper focus-visible:bg-paper data-[tone=danger]:text-red';

/**
 * The actions a letter offers: one that left can be answered (where the user can write), a text
 * that can be read can be copied, mine can be edited and taken back, anyone's can be hidden.
 */
export function actionsFor(
  message: Message,
  canModerate: boolean,
  canReply = true,
): MessageAction[] {
  if (message.status === 'pending') return [];
  const mine = message.direction === 'out' && message.status !== 'failed' && !message.retracted;
  const readable = message.body && !message.retracted && message.encryption !== 'undecryptable';
  const answerable = canReply && message.status !== 'failed' && !message.retracted;
  const actions: MessageAction[] = answerable ? ['reply'] : [];
  if (readable) actions.push('copy');
  if (mine && message.body && message.encryption !== 'undecryptable') actions.push('edit');
  actions.push('deleteForMe');
  if (mine) actions.push('deleteForEveryone');
  if (canModerate && message.direction === 'in' && !message.retracted) actions.push('moderate');
  return actions;
}

const ICONS = {
  reply: CornerUpLeft,
  copy: Copy,
  edit: Pencil,
  deleteForMe: EyeOff,
  deleteForEveryone: Trash2,
  moderate: Gavel,
};

/**
 * The "⋯" of a bubble's hover toolbar and its menu. The focus goes to the first item on open and
 * back to the "⋯" on close; picking an item closes the menu first, so a dialog that follows knows
 * its opener.
 */
export function MessageActions({
  actions,
  onPick,
}: {
  actions: MessageAction[];
  onPick: (action: MessageAction) => void;
}) {
  const text = useText();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  // WebKit does not focus a button on mousedown: a blur to nowhere is a click inside, not a Tab out.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && !menu.current?.contains(next)) setOpen(false);
  }

  if (actions.length === 0) return null;
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        className="size-7 border-none p-0"
        aria-label={text('message.actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Ellipsis size={16} aria-hidden />
      </Button>
      {open && (
        <Popover
          anchor={trigger.current}
          label={text('message.actions')}
          prefer="below"
          onClose={close}
        >
          <div
            ref={menu}
            className="flex min-w-[200px] flex-col"
            role="menu"
            aria-label={text('message.actions')}
            onBlur={onBlur}
          >
            {actions.map((action) => {
              const Icon = ICONS[action];
              return (
                <button
                  key={action}
                  type="button"
                  role="menuitem"
                  className={ITEM}
                  data-tone={
                    action === 'deleteForEveryone' || action === 'moderate' ? 'danger' : undefined
                  }
                  onClick={() => {
                    close();
                    onPick(action);
                  }}
                >
                  <Icon size={16} aria-hidden />
                  {text(`message.action.${action}`)}
                </button>
              );
            })}
          </div>
        </Popover>
      )}
    </>
  );
}
