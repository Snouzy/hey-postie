import { DoorOpen, MessageSquarePlus, Users } from 'lucide-react';
import { useEffect } from 'react';
import { useText } from '../core/CoreProvider';
import { Avatar } from './Avatar';
import styles from './NewChatPicker.module.css';
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
    <div id={id} className={styles.list} role="listbox" aria-label={text('newChat.title')}>
      {groups.map(({ kind, heading }) => {
        const members = rows
          .map((row, index) => ({ row, index }))
          .filter((m) => m.row.kind === kind);
        if (members.length === 0) return null;
        return (
          <div key={kind} className={styles.group}>
            {heading && <h3 className={styles.heading}>{heading}</h3>}
            <div className={styles.rows}>
              {members.map(({ row, index }) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the keys are heard by the search field (combobox).
                <div
                  key={pickerRowId(id, index)}
                  id={pickerRowId(id, index)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  className={styles.row}
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
        <span className={styles.name}>{contact.name}</span>
        <span className={styles.jid}>{contact.jid}</span>
      </>
    );
  }
  if (row.kind === 'room') {
    return (
      <>
        <Users size={16} className={styles.icon} aria-hidden />
        <span className={styles.name}>{row.room.name}</span>
        <span className={styles.jid}>{row.room.jid}</span>
      </>
    );
  }
  const Icon = row.target === 'room' ? DoorOpen : MessageSquarePlus;
  const label = text(row.target === 'room' ? 'newChat.joinHall' : 'newChat.writeTo');
  return (
    <>
      <Icon size={16} className={styles.icon} aria-hidden />
      <span className={styles.name}>{label.replace('{jid}', row.jid)}</span>
    </>
  );
}
