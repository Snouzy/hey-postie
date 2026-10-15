import { DomainError } from '../../contracts/errors';
import type { RosterRepository } from '../../contracts/repositories';
import type { Contact } from '../../contracts/types';
import type { ConverseEngine } from './engine';
import { toContact } from './mappers';
import type { CollectionLike, ContactModel } from './models';

type Handler = (contact: Contact) => void;

/** The roster of wiki/development/converse.md §3. Unsaved (auto-created) contacts are skipped. */
export class ConverseRosterRepository implements RosterRepository {
  private readonly handlers = new Set<Handler>();
  private bound: CollectionLike<ContactModel> | null = null;

  constructor(private readonly engine: ConverseEngine) {
    // The collection is recreated at every login (`plugins/roster/utils.js:14-19`): bind each time.
    engine.on('rosterInitialized', () => this.bindCollection());
    engine.on('contactPresenceChanged', (contact) => this.emit(contact));
    engine.on('contactRequest', (contact) => this.emit(contact));
  }

  async list(): Promise<Contact[]> {
    const { api, state } = await this.engine.ready();
    await api.waitUntil('rosterContactsFetched');
    const models = state.roster?.models ?? [];
    return models.filter((model) => !model.isUnsaved()).map(toContact);
  }

  async add(jid: string, name?: string): Promise<Contact> {
    const { api } = await this.engine.ready();
    try {
      const contact = await api.contacts.add(name ? { jid, name } : { jid });
      return toContact(contact);
    } catch (error) {
      throw new DomainError('Unknown', 'Unknown: the server refused the contact', error);
    }
  }

  async remove(jid: string): Promise<void> {
    const { api } = await this.engine.ready();
    try {
      await api.contacts.remove(jid, true);
    } catch (error) {
      throw new DomainError('Unknown', 'Unknown: the server refused the removal', error);
    }
  }

  onChange(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private bindCollection(): void {
    this.engine.ready().then(({ state }) => {
      const roster = state.roster;
      if (!roster || roster === this.bound) return;
      this.bound = roster;
      roster.on('add', (contact) => this.emit(contact));
      roster.on('change', (contact) => this.emit(contact));
      roster.on('remove', (contact) => this.emit(contact, { subscription: 'none' }));
    });
  }

  private emit(model: unknown, patch: Partial<Contact> = {}): void {
    const contact = model as ContactModel;
    if (typeof contact?.get !== 'function' || contact.isUnsaved()) return;
    const mapped = { ...toContact(contact), ...patch };
    for (const handler of this.handlers) handler(mapped);
  }
}
