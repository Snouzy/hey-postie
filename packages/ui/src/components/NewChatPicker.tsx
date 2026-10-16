import { DoorOpen, MessageSquarePlus, Users } from 'lucide-react';
import { useEffect } from 'react';
import { useText } from '../core/CoreProvider';
import { Avatar } from './Avatar';
import { PresenceDot } from './PresenceDot';
import type { PickerRow } from './pickerRows';

interface NewChatPickerProps {
  /** The `id` of the listbox, so the search field can point at it. */
  id: string;
  rows: PickerRow[];
  /** The row the keyboard is on; the field names it through `aria-activedescendant`. */
  activeIndex: number;
  onPick: (row: PickerRow) => void;
}

const LIST = '-mx-2 flex max-h-[320px] flex-col gap-3 overflow-y-auto px-2';
// The group headings of ContactList.
const HEADING =
  'm-0 px-3 pt-0 pb-1 font-text text-[12px] font-bold tracking-[0.04em] text-ink-muted uppercase';
// A row like ChatList's; the active one takes the wash of a chosen chat.
const ROW =
  'flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-ink transition-[background-color] duration-(--motion-fast) hover:bg-fill-hover aria-selected:bg-fill-chosen';
const ICON = 'w-[28px] shrink-0 text-ink-muted';
const NAME = 'max-w-[60%] shrink-0 truncate font-semibold';
const JID = 'min-w-0 flex-1 truncate font-mono text-[12px] text-ink-muted';

/** The `id` of a row, shared with the search field's `aria-activedescendant`. */
export function pickerRowId(listId: string, index: number): string {
  return `${listId}-${index}`;
}

/**
 * The list under the search field of "New chat": the address book, then the halls, then the
 * typed text as an address. Focus stays in the field; the active row follows the arrow keys.
 */
export function NewChatPicker({ id, rows, activeIndex, onPick }: NewChatPickerProps) {
  const text = useText();

  useEffect(() => {
    document.getElementById(pickerRowId(id, activeIndex))?.scrollIntoView?.({ block: 'nearest' });
  }, [id, activeIndex]);

  const groups: { kind: PickerRow['kind']; heading: string | null }[] = [
    { kind: 'contact', heading: text('newChat.contacts') },
    { kind: 'room', heading: text('newChat.halls') },
    { kind: 'address', heading: null },
  ];

  return (
    <div id={id} className={LIST} role="listbox" aria-label={text('newChat.title')}>
      {groups.map(({ kind, heading }) => {
        const members = rows
          .map((row, index) => ({ row, index }))
          .filter((m) => m.row.kind === kind);
        if (members.length === 0) return null;
        return (
          <div key={kind}>
            {heading && <h3 className={HEADING}>{heading}</h3>}
            <div className="flex flex-col gap-[2px]">
              {members.map(({ row, index }) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the keys are heard by the search field (combobox).
                <div
                  key={pickerRowId(id, index)}
                  id={pickerRowId(id, index)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  className={ROW}
                  onMouseDown={(event) => event.preventDefault()} // the focus stays in the field
                  onClick={() => onPick(row)}
                >
                  <Row row={row} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ row }: { row: PickerRow }) {
  const text = useText();
  if (row.kind === 'contact') {
    const { contact } = row;
    return (
      <>
        <Avatar name={contact.name} jid={contact.jid} avatarUrl={contact.avatarUrl} size={28} />
        <PresenceDot presence={contact.presence} />
        <span className={NAME}>{contact.name}</span>
        <span className={JID}>{contact.jid}</span>
      </>
    );
  }
  if (row.kind === 'room') {
    return (
      <>
        <Users size={16} className={ICON} aria-hidden />
        <span className={NAME}>{row.room.name}</span>
        <span className={JID}>{row.room.jid}</span>
      </>
    );
  }
  const Icon = row.target === 'room' ? DoorOpen : MessageSquarePlus;
  const label = text(row.target === 'room' ? 'newChat.joinHall' : 'newChat.writeTo');
  return (
    <>
      <Icon size={16} className={ICON} aria-hidden />
      <span className={NAME}>{label.replace('{jid}', row.jid)}</span>
    </>
  );
}
