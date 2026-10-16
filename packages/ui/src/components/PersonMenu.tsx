import { Ban, Ellipsis, ShieldCheck, UserMinus, UserRound } from 'lucide-react';
import { type FocusEvent, useEffect, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import { hallStyles } from './hallStyles';
import { Popover } from './Popover';

/** What can be done to someone of a hall, from their row in the panel. */
export type PersonAction = 'admin' | 'member' | 'remove' | 'ban';

const ICONS = { admin: ShieldCheck, member: UserRound, remove: UserMinus, ban: Ban };

interface PersonMenuProps {
  /** The person's name, for the button and the menu. */
  name: string;
  actions: PersonAction[];
  onPick: (action: PersonAction) => void;
}

/**
 * The "⋯" of a person's row and its menu: Make admin, Make member, Remove from the hall…,
 * Ban…. The focus goes to the first item on open and back to the "⋯" on close; picking an item
 * closes the menu first, so the confirmation that follows knows its opener.
 */
export function PersonMenu({ name, actions, onPick }: PersonMenuProps) {
  const text = useText();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const label = text('room.personActions').replace('{name}', name);

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

  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        className="p-1"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Ellipsis size={16} aria-hidden />
      </Button>
      {open && (
        <Popover anchor={trigger.current} label={label} prefer="below" onClose={close}>
          <div
            ref={menu}
            className="flex min-w-[180px] flex-col"
            role="menu"
            aria-label={label}
            onBlur={onBlur}
          >
            {actions.map((action) => {
              const Icon = ICONS[action];
              return (
                <button
                  key={action}
                  type="button"
                  role="menuitem"
                  className={hallStyles.menuItem}
                  data-tone={action === 'remove' || action === 'ban' ? 'danger' : undefined}
                  onClick={() => {
                    close();
                    onPick(action);
                  }}
                >
                  <Icon size={16} aria-hidden />
                  {text(`room.person.${action}`)}
                </button>
              );
            })}
          </div>
        </Popover>
      )}
    </>
  );
}
