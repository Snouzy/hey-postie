/**
 * The slice of Converse (skeletor models, `api`, `env`) that the repositories touch. Converse ships
 * loose declarations, so we describe only what we call; see wiki/development/converse.md.
 */

export type Handler = (...args: unknown[]) => void;

export interface ModelLike {
  get(key: string): unknown;
  save(attributes: Record<string, unknown>): unknown;
  on(event: string, handler: Handler): unknown;
  off(event: string, handler: Handler): unknown;
}

export interface CollectionLike<M> {
  models: M[];
  length: number;
  get(id: string): M | undefined;
  on(event: string, handler: Handler): unknown;
  off(event: string, handler: Handler): unknown;
}

export type MessageModel = ModelLike;

export interface ChatModel extends ModelLike {
  messages: CollectionLike<MessageModel> & { fetched?: Promise<unknown> };
  /** The queue through which parsed messages become models (`model-with-messages.js:268-272`). */
  msg_chain?: Promise<unknown>;
  sendMessage(attributes: { body: string }): Promise<MessageModel | undefined>;
  /** Synchronous on a direct chat, async on a room (`plugins/muc/muc.js` sends a marker first). */
  clearUnreadMsgCounter(): Promise<unknown> | undefined;
  getDisplayName(): string | null | undefined;
}

/** A MUC (`plugins/muc/muc.js`); `session.connection_status` holds a `RoomStatus` value. */
export interface RoomModel extends ChatModel {
  /** Undefined until `setup()` restored it; `initialized` resolves after that. */
  session?: ModelLike;
  occupants: CollectionLike<OccupantModel>;
  /** Resolves once `setup()` is done, that is once the join presence of a new room is sent. */
  initialized?: Promise<unknown>;
  isEntered(): boolean;
  /** Converse's mention rule (case-sensitive): replaced per model by `mappers.isMention`. */
  isUserMentioned(message: MessageModel): boolean;
  join(nick?: string, password?: string): Promise<void>;
  close(): Promise<unknown>;
}

export interface OccupantModel extends ModelLike {
  getDisplayName(): string | null | undefined;
}

export type BookmarkModel = ModelLike;

/** `getIdentity()` would wait for the entity's items; the identities already known are read directly. */
export interface DiscoEntityLike {
  identities: { findWhere(attributes: { category: string; type: string }): unknown };
}

export interface BookmarksCollection extends CollectionLike<BookmarkModel> {
  add(model: BookmarkModel, options?: { silent?: boolean }): unknown;
  remove(model: BookmarkModel, options?: { silent?: boolean }): unknown;
  sendRemoveBookmarkStanza(bookmark: BookmarkModel): Promise<unknown>;
}

/** `ROOMSTATUS` (`plugins/muc/constants.js:70`), exposed as `converse.ROOMSTATUS`. */
export interface RoomStatus {
  CONNECTED: number;
  CONNECTING: number;
  NICKNAME_REQUIRED: number;
  PASSWORD_REQUIRED: number;
  DISCONNECTED: number;
  ENTERED: number;
  DESTROYED: number;
  BANNED: number;
  CLOSING: number;
}

export interface ContactModel extends ModelLike {
  getDisplayName(): string | null | undefined;
  getStatus(): string;
  isUnsaved(): boolean;
}

/** Strophe's connection, including the private members the close reason needs (socketClose.ts). */
export interface ConnectionLike {
  connected?: boolean;
  jid?: string;
  _proto?: { _onClose?: (event: CloseEvent) => void };
  xmlInput(body: Element): void;
  xmlOutput(body: Element): void;
  addHandler(
    handler: (stanza: Element) => boolean,
    ns: string | null,
    name: string,
    type?: string | null,
    id?: string | null,
    from?: string | null,
    options?: { matchBareFromJid?: boolean },
  ): unknown;
  deleteHandler(reference: unknown): void;
  _changeConnectStatus(status: number, condition?: string): void;
  _doDisconnect(): void;
}

export type StropheStatusCallback = (status: number, condition?: string | null) => void;

/**
 * A bare `Strophe.Connection` driven without Converse (registration.ts), with the privates the
 * registration flow borrows from Converse's own register plugin: `_connect_cb` to read the stream
 * features before any SASL step, `_addSysHandler` for IQ handlers that run unauthenticated.
 */
export interface StropheConnection extends ConnectionLike {
  connected: boolean;
  _proto: {
    _onClose?: (event: CloseEvent) => void;
    _connect_cb(body: Element): number | undefined;
    _abortAllRequests(): void;
  };
  connect(jid: string, password: string, callback: StropheStatusCallback): void;
  disconnect(reason?: string): void;
  send(stanza: Element): void;
  getUniqueId(suffix?: string): string;
  _connect_cb(body: Element, callback: unknown, raw?: string): void;
  _addSysHandler(
    handler: (stanza: Element) => boolean,
    ns: string | null,
    name: string | null,
    type: string | null,
    id: string | null,
  ): unknown;
}

/** The localForage instance behind Converse's persistent store (`utils/init.js:106-136`). */
export interface PersistentStorageLike {
  dropInstance(options: { name: string; storeName: string }): Promise<void>;
}

export interface ConverseApi {
  settings: { get(key: string): unknown; set(key: string, value: unknown): void };
  user: { login(jid: string, password: string): Promise<void>; logout(): Promise<void> };
  connection: { get(): ConnectionLike | undefined; authenticated(): boolean | undefined };
  listen: {
    on(name: string, handler: Handler): unknown;
    not(name: string, handler: Handler): unknown;
  };
  waitUntil(name: string): Promise<unknown> | null;
  /** Rejects with the error stanza, or `null` on timeout (`shared/api/send.js:49-75`). */
  sendIQ(stanza: unknown, timeout?: number): Promise<Element>;
  contacts: {
    add(attributes: { jid: string; name?: string }): Promise<ContactModel>;
    remove(jid: string, unsubscribe?: boolean): Promise<void>;
  };
  chats: {
    get(jid: string): Promise<ChatModel | null | undefined>;
    open(jid: string): Promise<ChatModel | undefined>;
  };
  rooms: {
    /** Never pass `password` here: a model attribute is persisted and published with the bookmark. */
    get(
      jid: string,
      attributes?: { nick?: string; hidden?: boolean },
      create?: boolean,
    ): Promise<RoomModel | null | undefined>;
  };
  bookmarks: {
    set(
      attributes: { jid: string; name?: string; nick?: string; autojoin?: boolean },
      create?: boolean,
      options?: { silent?: boolean },
    ): Promise<unknown>;
    get(jid: string): Promise<BookmarkModel | undefined>;
  };
  disco: {
    info(jid: string, node?: string | null, options?: { timeout?: number }): Promise<Element>;
    items(jid: string, node?: string): Promise<Element>;
    getIdentity(category: string, type: string, jid: string): Promise<ModelLike | undefined>;
    /** The cached entity, or undefined when nothing was ever discovered about the JID. */
    entities: { get(jid: string): Promise<DiscoEntityLike | undefined> };
  };
  alert?: Handler;
}

export interface ConverseState {
  connfeedback: ModelLike;
  session?: ModelLike;
  roster?: CollectionLike<ContactModel>;
  chatboxes?: CollectionLike<ChatModel>;
  /** Only once the server advertised PEP with publish-options (`plugins/bookmarks/plugin.js:138`). */
  bookmarks?: BookmarksCollection;
}

export interface ConverseEnv {
  Strophe: {
    Status: Record<string, number>;
    Connection: new (service: string) => StropheConnection;
    getBareJidFromJid(jid: string): string | null;
  };
  u: {
    mam: {
      fetchArchivedMessages(
        chat: ChatModel,
        options: { rsm?: { before?: string; max?: number } },
        page?: boolean,
      ): Promise<void>;
    };
  };
  stx: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
}

export interface ConverseHeadless {
  converse: {
    initialize(settings: Record<string, unknown>): Promise<unknown>;
    env: ConverseEnv;
    ROOMSTATUS: RoomStatus;
  };
  api: ConverseApi;
  _converse: { state: ConverseState; storage: { persistent?: PersistentStorageLike } };
  MAMPlaceholderMessage: new (...args: never[]) => unknown;
}
