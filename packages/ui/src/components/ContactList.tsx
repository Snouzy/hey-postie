import type { Contact, Presence } from '@hey-postie/core';
import { useText } from '../core/CoreProvider';
import { Avatar } from './Avatar';
import styles from './ContactList.module.css';
import { PresenceDot } from './PresenceDot';

interface ContactListProps {
  contacts: Contact[];
  onSelect: (contact: Contact) => void;
}

const PRESENCES: readonly Presence[] = ['online', 'away', 'dnd', 'offline'];

/** The address book, grouped by presence. A click opens the chat with that contact. */
export function ContactList({ contacts, onSelect }: ContactListProps) {
  const text = useText();
  if (contacts.length === 0) return <p className={styles.empty}>{text('contacts.empty')}</p>;

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
                    <Avatar
                      name={contact.name}
                      jid={contact.jid}
                      avatarUrl={contact.avatarUrl}
                      size={28}
                    />
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
