import type { RosterRepository } from '../contracts/repositories';
import type { Contact } from '../contracts/types';

type Handler = (contact: Contact) => void;

/** In-memory roster. Tests seed it with `seed()` and push changes with `change()`. */
export class FakeRoster implements RosterRepository {
  private readonly contacts = new Map<string, Contact>();
  private readonly handlers = new Set<Handler>();

  seed(...contacts: Contact[]): void {
    for (const contact of contacts) this.contacts.set(contact.jid, contact);
  }

  /** Simulates a change coming from the server (presence, name, subscription). */
  change(contact: Contact): void {
    this.contacts.set(contact.jid, contact);
    for (const handler of this.handlers) handler(contact);
  }

  async list(): Promise<Contact[]> {
    return [...this.contacts.values()];
  }

  async add(jid: string, name?: string): Promise<Contact> {
    const contact: Contact = {
      jid,
      name: name ?? jid.split('@')[0] ?? jid,
      presence: 'offline',
      subscription: 'none',
    };
    this.change(contact);
    return contact;
  }

  async remove(jid: string): Promise<void> {
    const contact = this.contacts.get(jid);
    this.contacts.delete(jid);
    if (contact) for (const handler of this.handlers) handler({ ...contact, subscription: 'none' });
  }

  onChange(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
