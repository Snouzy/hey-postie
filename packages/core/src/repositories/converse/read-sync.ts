import type { ConverseEngine, Loaded } from './engine';
import { isRoom } from './mappers';
import type { ChatModel, MessageModel } from './models';
import { millis } from './read-markers';

/**
 * XEP-0490 Message Displayed Synchronization: the read position of each chat, shared between our
 * own devices through a private PEP node (one item per chat, id = the chat's bare JID, payload =
 * the archive's stanza id of the last letter displayed). Converse 14 does not speak it. Nothing
 * here leaves the account, so it ignores the "tell others I read" setting.
 */

export const MDS_NODE = 'urn:xmpp:mds:displayed:0';
const SID_NS = 'urn:xmpp:sid:0';
const PUBSUB_EVENT = 'http://jabber.org/protocol/pubsub#event';
const PUBLISH_OPTIONS = 'http://jabber.org/protocol/pubsub#publish-options';
/** XEP-0490 §4: kept, as many items as chats, never pushed on presence, readable by us only. */
const NODE_OPTIONS = {
  persist_items: 'true',
  max_items: 'max',
  send_last_published_item: 'never',
  access_model: 'whitelist',
};

/** The chat attribute holding the time (ISO 8601) of the newest letter one of our devices displayed. */
export const DISPLAYED_AT = 'mds_displayed_at';

/** One item of the node: in chat `chatJid`, the letter stamped `stanzaId` by archive `by` was displayed. */
export interface Displayed {
  chatJid: string;
  stanzaId: string;
  by: string;
}

/** What `applyDisplayed` did: `pending` when the letter is not held (yet). */
export type ApplyOutcome = 'applied' | 'ignored' | 'pending';

export class ConverseReadSync {
  private handler: unknown = null;
  /** Per chat, an item whose letter is not held yet: applied when that letter arrives (MAM). */
  private readonly pending = new Map<string, Displayed>();
  private readonly bound = new WeakSet<ChatModel>();

  constructor(private readonly engine: ConverseEngine) {
    // Before the first presence, whose caps announce it: the server then pushes new items (XEP-0163).
    engine.on('addClientFeatures', () =>
      engine.current?.api.disco.own.features.add(`${MDS_NODE}+notify`),
    );
    for (const event of ['connected', 'reconnected']) {
      engine.on(event, () => {
        this.listen();
        void this.catchUp();
      });
    }
    engine.onReady((loaded) => this.bindCollection(loaded));
  }

  /**
   * Publishes the chat's position after a local read: the newest letter stamped by its archive.
   * Silent when there is none, when it is not newer than the known position, or when the server
   * lacks publish-options (`api.pubsub.publish` then returns without sending, strict options).
   */
  async publish(chat: ChatModel): Promise<void> {
    const loaded = this.engine.current;
    const self = loaded ? selfJid(loaded) : '';
    if (!loaded?.api.pubsub || !self) return;
    const by = archiveJid(chat, self);
    const newest = newestStamped(chat, by);
    const at = millis(newest?.get('time'));
    const previous = millis(chat.get(DISPLAYED_AT));
    if (!newest || at === null || (previous !== null && at <= previous)) return;
    const jid = String(chat.get('jid'));
    const stanzaId = String(newest.get(`stanza_id ${by}`));
    const item = loaded.env
      .stx`<item id="${jid}"><displayed xmlns="${MDS_NODE}"><stanza-id xmlns="${SID_NS}" id="${stanzaId}" by="${by}"/></displayed></item>`;
    await loaded.api.pubsub.publish(self, MDS_NODE, item, NODE_OPTIONS, true);
    // An item from another device may have moved the position meanwhile: never backwards.
    const now = millis(chat.get(DISPLAYED_AT));
    if (now === null || now < at) chat.save({ [DISPLAYED_AT]: new Date(at).toISOString() });
  }

  private apply(displayed: Displayed): void {
    const loaded = this.engine.current;
    const chat = loaded?.state.chatboxes?.get(displayed.chatJid);
    if (!loaded || !chat || !isChat(chat)) return;
    const outcome = applyDisplayed(chat, displayed, selfJid(loaded));
    if (outcome === 'pending') this.pending.set(displayed.chatJid, displayed);
    else this.pending.delete(displayed.chatJid);
  }

  /** Items pushed by the server: `<event>` messages from our own bare JID. */
  private listen(): void {
    const connection = this.engine.current?.api.connection.get();
    if (!connection) return;
    if (this.handler) connection.deleteHandler(this.handler);
    this.handler = connection.addHandler(
      (stanza: Element) => {
        const loaded = this.engine.current;
        const from = stanza.getAttribute('from')?.toLowerCase();
        if (!loaded || from !== selfJid(loaded)) return true;
        for (const displayed of displayedItems(stanza)) this.apply(displayed);
        return true;
      },
      PUBSUB_EVENT,
      'message',
      null,
      null,
      null,
    );
  }

  /** Once per connection: reads done on other devices while this one was away. */
  private async catchUp(): Promise<void> {
    const loaded = this.engine.current;
    const self = loaded ? selfJid(loaded) : '';
    const pubsub = loaded?.api.pubsub;
    if (!loaded || !pubsub || !self) return;
    const { api } = loaded;
    try {
      await api.waitUntil('chatBoxesFetched');
      const supported =
        (await api.disco.supports(PUBLISH_OPTIONS, self)) ||
        (await api.disco.supports(PUBLISH_OPTIONS, self.split('@')[1] ?? ''));
      if (!supported) return;
      const { items } = await pubsub.items.get(null, MDS_NODE);
      for (const item of items) {
        const displayed = parseDisplayed(item);
        if (displayed) this.apply(displayed);
      }
    } catch {
      // `item-not-found` until the first publish, from this device or another.
      console.warn('read sync: no catch-up');
    }
  }

  private bindCollection(loaded: Loaded): void {
    const chatboxes = loaded.state.chatboxes;
    if (!chatboxes) return;
    for (const chat of chatboxes.models) this.bindChat(chat);
    chatboxes.on('add', (chat) => this.bindChat(chat as ChatModel));
  }

  private bindChat(chat: ChatModel): void {
    if (!isChat(chat) || this.bound.has(chat)) return;
    this.bound.add(chat);
    chat.messages.on('add', (model) => {
      const waiting = this.pending.get(String(chat.get('jid')));
      const letter = model as MessageModel;
      if (waiting && letter.get(`stanza_id ${waiting.by}`) === waiting.stanzaId) {
        this.apply(waiting);
      }
    });
  }
}

/**
 * Moves the chat's position to the displayed letter, never backwards, and lowers its unread
 * counters to the incoming letters after it (zero in the usual case). Saving the counters is what
 * makes `onChatChange` fire; no XEP-0333 marker is sent and nothing is published again.
 */
export function applyDisplayed(chat: ChatModel, displayed: Displayed, self: string): ApplyOutcome {
  if (displayed.by !== archiveJid(chat, self)) return 'ignored';
  const key = `stanza_id ${displayed.by}`;
  const letter = chat.messages.models.find((model) => model.get(key) === displayed.stanzaId);
  if (!letter) return 'pending';
  const at = millis(letter.get('time'));
  const previous = millis(chat.get(DISPLAYED_AT));
  if (at === null || (previous !== null && at <= previous)) return 'ignored';
  const unread = chat.messages.models.filter((model) => {
    const time = millis(model.get('time'));
    return time !== null && time > at && isIncomingLetter(model);
  }).length;
  chat.save({ [DISPLAYED_AT]: new Date(at).toISOString(), ...counters(chat, unread) });
  return 'applied';
}

/** Converse's counters, lowered only: `num_unread` in a direct chat; in a hall, also mentions. */
function counters(chat: ChatModel, unread: number): Record<string, unknown> {
  const lower = (key: string) => Math.min(Number(chat.get(key)) || 0, unread);
  if (!isRoom(chat)) return { num_unread: lower('num_unread') };
  return {
    num_unread_general: lower('num_unread_general'),
    num_unread: lower('num_unread'),
    ...(unread === 0 ? { has_activity: false } : {}),
  };
}

/** A letter from someone else, of the kind Converse counts as unread (`handleUnreadMessage`). */
function isIncomingLetter(model: MessageModel): boolean {
  return (
    model.get('sender') !== 'me' &&
    Boolean(model.get('body')) &&
    !model.get('retracted') &&
    !model.get('is_ephemeral')
  );
}

/** The newest model of the chat stamped by its archive (any kind: only its position matters). */
export function newestStamped(chat: ChatModel, by: string): MessageModel | undefined {
  const key = `stanza_id ${by}`;
  let newest: MessageModel | undefined;
  for (const model of chat.messages.models) {
    if (typeof model.get(key) !== 'string') continue;
    const time = millis(model.get('time'));
    if (time !== null && (!newest || time >= (millis(newest.get('time')) ?? 0))) newest = model;
  }
  return newest;
}

/** The node's items in a PEP `<event>` message (retractions are ignored). */
export function displayedItems(stanza: Element): Displayed[] {
  const event = childNamed(stanza, 'event', PUBSUB_EVENT);
  const items = event ? childNamed(event, 'items') : undefined;
  if (!items || items.getAttribute('node') !== MDS_NODE) return [];
  return [...items.children]
    .filter((child) => child.localName === 'item')
    .map(parseDisplayed)
    .filter((displayed): displayed is Displayed => displayed !== null);
}

/** One `<item>`: its id is the chat, its payload the stanza id. Null when anything is missing. */
export function parseDisplayed(item: Element): Displayed | null {
  const chatJid = item.getAttribute('id')?.toLowerCase();
  const displayed = childNamed(item, 'displayed', MDS_NODE);
  const stanzaId = displayed ? childNamed(displayed, 'stanza-id', SID_NS) : undefined;
  const id = stanzaId?.getAttribute('id');
  const by = stanzaId?.getAttribute('by')?.toLowerCase();
  return chatJid && id && by ? { chatJid, stanzaId: id, by } : null;
}

function childNamed(parent: Element, name: string, namespace?: string): Element | undefined {
  return [...parent.children].find(
    (child) =>
      child.localName === name &&
      (!namespace || child.namespaceURI === namespace || child.getAttribute('xmlns') === namespace),
  );
}

/** Who stamps the chat's stanza ids: our own account for a direct chat, the room for a hall. */
function archiveJid(chat: ChatModel, self: string): string {
  return isRoom(chat) ? String(chat.get('jid')).toLowerCase() : self;
}

function selfJid(loaded: Loaded): string {
  return String(loaded.state.session?.get('bare_jid') ?? '').toLowerCase();
}

/** Direct chats and halls, as in `chat.ts`; feeds (`headline`) are not chats. */
function isChat(chat: ChatModel): boolean {
  return chat.get('type') === 'chatbox' || isRoom(chat);
}
