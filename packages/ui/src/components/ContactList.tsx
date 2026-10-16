import type { Contact, Presence } from '@hey-postie/core';
import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';
import styles from './ContactList.module.css';
import { EmptyState } from './EmptyState';
import { PresenceDot } from './PresenceDot';

interface ContactListProps {
  contacts: Contact[];
  onSelect: (contact: Contact) => void;
  /** "Add a contact" on the empty state; without it, the sentence alone. */
  onAddContact?: () => void;
}

const PRESENCES: readonly Presence[] = ['online', 'away', 'dnd', 'offline'];

/** The address book, grouped by presence. A click opens the chat with that contact. */
export function ContactList({ contacts, onSelect, onAddContact }: ContactListProps) {
  const text = useText();
  if (contacts.length === 0) {
    return (
      <EmptyState
        illustration={<Postie mood="searching" label={text('postie.alt.searching')} size={96} />}
        title={text('contacts.empty')}
        sentence={text('contacts.emptyHint')}
        action={onAddContact && { label: text('contacts.addContact'), onClick: onAddContact }}
      />
    );
  }

  return (
    <div className={styles.groups}>
      {PRESENCES.map((presence) => {
        const group = contacts.filter((contact) => contact.presence === presence);
        if (group.length === 0) return null;
        return (
          <section key={presence} className={styles.group}>
            <h3 className={styles.heading}>{text(`presence.${presence}`)}</h3>
            <ul className={styles.list}>
              {group.map((contact) => (
                <li key={contact.jid}>
                  <button type="button" className={styles.row} onClick={() => onSelect(contact)}>
                    <PresenceDot presence={contact.presence} />
                    <span className={styles.name}>{contact.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
