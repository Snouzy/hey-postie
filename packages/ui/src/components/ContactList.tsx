import type { Contact, Presence } from '@hey-postie/core';
import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';
import { Avatar } from './Avatar';
import { EmptyState } from './EmptyState';
import { PresenceDot } from './PresenceDot';

interface ContactListProps {
  contacts: Contact[];
  onSelect: (contact: Contact) => void;
  /** "Add a contact" on the empty state; without it, the sentence alone. */
  onAddContact?: () => void;
}

const ROW =
  'flex w-full cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent px-3 py-2 text-left text-ink transition-[background-color] duration-(--motion-fast) hover:bg-fill-hover';

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
    <div className="flex flex-col gap-3 px-2 py-0">
      {PRESENCES.map((presence) => {
        const group = contacts.filter((contact) => contact.presence === presence);
        if (group.length === 0) return null;
        return (
          <section key={presence}>
            <h3 className="px-3 pt-0 pb-1 font-text text-[12px] font-bold tracking-[0.04em] text-ink-muted uppercase">
              {text(`presence.${presence}`)}
            </h3>
            <ul className="m-0 list-none p-0">
              {group.map((contact) => (
                <li key={contact.jid}>
                  <button type="button" className={ROW} onClick={() => onSelect(contact)}>
                    <Avatar
                      name={contact.name}
                      jid={contact.jid}
                      avatarUrl={contact.avatarUrl}
                      size={28}
                    />
                    <PresenceDot presence={contact.presence} />
                    <span className="truncate">{contact.name}</span>
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
