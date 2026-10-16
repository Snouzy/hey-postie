import { DomainError } from '../contracts/errors';
import type { RosterRepository } from '../contracts/repositories';
import type { Contact, ContactRequest } from '../contracts/types';

type Handler = (contact: Contact) => void;
type RequestHandler = (request: ContactRequest) => void;

/**
 * In-memory roster and blocklist. Tests seed it with `seed()`, push changes with `change()` and
 * simulate a stranger's subscription request with `request()`.
 */
export class FakeRoster implements RosterRepository {
  readonly blocked = new Set<string>();
  private readonly contacts = new Map<string, Contact>();
  private readonly pending = new Map<string, ContactRequest>();
  private readonly handlers = new Set<Handler>();
  private readonly requestHandlers = new Set<RequestHandler>();

  seed(...contacts: Contact[]): void {
    for (const contact of contacts) this.contacts.set(contact.jid, contact);
  }

  /** Simulates a change coming from the server (presence, name, subscription). */
  change(contact: Contact): void {
    this.contacts.set(contact.jid, contact);
    for (const handler of this.handlers) handler(contact);
  }

  /** A stranger asks to subscribe. Like a server with XEP-0191, a blocked JID gets nowhere. */
  request(request: ContactRequest): void {
    if (this.blocked.has(request.jid)) return;
    this.pending.set(request.jid, request);
    for (const handler of this.requestHandlers) handler(request);
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

  async requests(): Promise<ContactRequest[]> {
    return [...this.pending.values()];
  }

  /** Approved: the peer sees us (`from`); `both` comes once they approve our request back. */
  async accept(jid: string): Promise<Contact> {
    const request = this.pending.get(jid);
    if (!request) throw new DomainError('Unknown', 'Unknown: no such request');
    this.pending.delete(jid);
    const contact: Contact = {
      jid,
      name: request.name,
      presence: 'offline',
      subscription: 'from',
    };
    this.change(contact);
    return contact;
  }

  async decline(jid: string): Promise<void> {
    this.pending.delete(jid);
  }

  async block(jid: string): Promise<void> {
    this.blocked.add(jid);
    this.pending.delete(jid);
  }

  async unblock(jid: string): Promise<void> {
    this.blocked.delete(jid);
  }

  onRequest(handler: RequestHandler): () => void {
    this.requestHandlers.add(handler);
    return () => this.requestHandlers.delete(handler);
  }
}
