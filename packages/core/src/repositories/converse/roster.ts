import { DomainError } from '../../contracts/errors';
import type { RosterRepository } from '../../contracts/repositories';
import type { Contact, ContactRequest } from '../../contracts/types';
import type { ConverseEngine, Loaded } from './engine';
import { bareJid, toContact } from './mappers';
import type { CollectionLike, ContactModel } from './models';

type Handler = (contact: Contact) => void;
type RequestHandler = (request: ContactRequest) => void;

/** Our attribute on a requesting contact: the `<status>` of the subscribe presence (never logged). */
const REQUEST_MESSAGE = 'hp_request_message';
const BLOCKING_NS = 'urn:xmpp:blocking';

/**
 * The roster of wiki/development/converse.md §3 and the subscription requests and blocklist of
 * §17. Converse keeps a stranger's request as a roster contact with `requesting: true`: `list()`
 * and `onChange` leave those out, `requests()` and `onRequest` carry them.
 */
export class ConverseRosterRepository implements RosterRepository {
  private readonly handlers = new Set<Handler>();
  private readonly requestHandlers = new Set<RequestHandler>();
  private bound: CollectionLike<ContactModel> | null = null;
  /** The sentence attached to a pending subscribe presence, by bare JID, until its contact exists. */
  private readonly requestMessages = new Map<string, string>();

  constructor(private readonly engine: ConverseEngine) {
    // The collection is recreated at every login (`plugins/roster/utils.js:14-19`): bind each time.
    engine.on('rosterInitialized', () => this.bindCollection());
    engine.on('contactPresenceChanged', (contact) => this.emit(contact));
    engine.on('contactRequest', (contact) => this.emitRequest(contact as ContactModel));
    // A reconnection resets Strophe's handlers; Converse re-adds its presence handler on this event.
    engine.on('presencesInitialized', () => this.watchSubscribePresence());
  }

  async list(): Promise<Contact[]> {
    const { api, state } = await this.engine.ready();
    await api.waitUntil('rosterContactsFetched');
    const models = state.roster?.models ?? [];
    return models.filter((model) => isListed(model)).map(toContact);
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

  async requests(): Promise<ContactRequest[]> {
    const { api, state } = await this.engine.ready();
    await api.waitUntil('rosterContactsFetched');
    const models = state.roster?.models ?? [];
    return models.filter((model) => isRequesting(model)).map(toRequest);
  }

  /**
   * `subscribed` (RFC 6121 §3.1.4; the server adds the roster item itself, §3.1.5) then
   * `subscribe` back: the contact is `from` until the peer approves, as the fake does.
   */
  async accept(jid: string): Promise<Contact> {
    const contact = await this.requesting(jid);
    contact.authorize().subscribeToPresence();
    return toContact(contact);
  }

  /** `unsubscribed` (RFC 6121 §3.1.6) and the local request model goes; the peer may ask again. */
  async decline(jid: string): Promise<void> {
    const loaded = await this.engine.ready();
    dropRequest(loaded, jid);
  }

  /**
   * XEP-0191 through Converse's blocklist plugin, which only exists when the server advertises
   * `urn:xmpp:blocking`. A pending request of the JID is dropped first: the plugin would do it
   * too, but later and after an `await` (`plugins/blocklist/collection.js:43-52`), on a model this
   * repository may already have destroyed. Dropped first, the plugin finds nothing to do.
   */
  async block(jid: string): Promise<void> {
    const loaded = await this.blocking();
    dropRequest(loaded, jid);
    try {
      await loaded.api.blocklist.add(jid);
    } catch (error) {
      throw new DomainError('Unknown', 'Unknown: the server refused the block', error);
    }
  }

  async unblock(jid: string): Promise<void> {
    const loaded = await this.blocking();
    try {
      await loaded.api.blocklist.remove(jid);
    } catch (error) {
      throw new DomainError('Unknown', 'Unknown: the server refused the unblock', error);
    }
  }

  onRequest(handler: RequestHandler): () => void {
    this.requestHandlers.add(handler);
    return () => this.requestHandlers.delete(handler);
  }

  private async requesting(jid: string): Promise<ContactModel> {
    const { api, state } = await this.engine.ready();
    await api.waitUntil('rosterContactsFetched');
    const contact = state.roster?.get(bareJid(jid).toLowerCase());
    if (!contact || !isRequesting(contact)) {
      throw new DomainError('Unknown', 'Unknown: no such request');
    }
    return contact;
  }

  private async blocking(): Promise<Loaded> {
    const loaded = await this.engine.ready();
    const domain = String(loaded.state.session?.get('domain') ?? '');
    if (!domain || !(await loaded.api.disco.supports(BLOCKING_NS, domain))) {
      throw new DomainError('Unknown', 'Unknown: the server has no blocklist (XEP-0191)');
    }
    return loaded;
  }

  /**
   * Converse's `contactRequest` hands out the contact, not the presence: the `<status>` sentence is
   * read here by a handler on the same stanza. Strophe runs every matching handler in turn, in the
   * order they were added, so the sentence is only certain to be known once the dispatch is over.
   */
  private watchSubscribePresence(): void {
    const connection = this.engine.current?.api.connection.get();
    connection?.addHandler(
      (stanza) => {
        const from = bareJid(stanza.getAttribute('from') ?? '').toLowerCase();
        const status = stanza.getElementsByTagName('status')[0]?.textContent?.trim() ?? '';
        if (from && status) this.requestMessages.set(from, status);
        return true;
      },
      null,
      'presence',
      'subscribe',
    );
  }

  private emitRequest(contact: ContactModel): void {
    queueMicrotask(() => {
      const jid = String(contact.get('jid'));
      const message = this.requestMessages.get(jid);
      this.requestMessages.delete(jid);
      if (message) contact.save({ [REQUEST_MESSAGE]: message });
      if (!isRequesting(contact)) return;
      const request = toRequest(contact);
      for (const handler of this.requestHandlers) handler(request);
    });
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
    if (typeof contact?.get !== 'function' || !isListed(contact)) return;
    const mapped = { ...toContact(contact), ...patch };
    for (const handler of this.handlers) handler(mapped);
  }
}

function isRequesting(contact: ContactModel): boolean {
  return contact.get('requesting') === true;
}

/**
 * Not a contact: an unsaved auto-created model (§3), a pending request, or a request that was just
 * authorized or refused. Converse saves `requesting: false` (never `null`, which a roster push
 * sets) in `authorize`, `unauthorize` and `addContact`; with no subscription in either direction
 * and no `ask`, such a model is a refused request on its way out, or a contact added an instant
 * ago whose roster push (then `ask="subscribe"`) is about to be emitted.
 */
function isListed(contact: ContactModel): boolean {
  if (contact.isUnsaved() || isRequesting(contact)) return false;
  return !(
    contact.get('requesting') === false &&
    contact.get('subscription') === 'none' &&
    !contact.get('ask')
  );
}

function toRequest(contact: ContactModel): ContactRequest {
  const jid = String(contact.get('jid'));
  const nickname = contact.get('nickname');
  const message = contact.get(REQUEST_MESSAGE);
  const request: ContactRequest = {
    jid,
    name: typeof nickname === 'string' && nickname ? nickname : (jid.split('@')[0] ?? jid),
  };
  return typeof message === 'string' && message ? { ...request, message } : request;
}

/** `unsubscribed` then the local model goes: Converse's own order (`plugins/blocklist/collection.js:50`). */
function dropRequest({ state }: Loaded, jid: string): void {
  const contact = state.roster?.get(bareJid(jid).toLowerCase());
  if (contact && isRequesting(contact)) contact.unauthorize().destroy();
}
