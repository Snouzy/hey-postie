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
  clearUnreadMsgCounter(): void;
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

export interface BookmarksCollection extends CollectionLike<BookmarkModel> {
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

/** Strophe's connection, including the private members the close reason needs (xmpp.ts). */
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

export interface ConverseApi {
  settings: { get(key: string): unknown; set(key: string, value: unknown): void };
  user: { login(jid: string, password: string): Promise<void>; logout(): Promise<void> };
  connection: { get(): ConnectionLike | undefined; authenticated(): boolean | undefined };
  listen: {
    on(name: string, handler: Handler): unknown;
    not(name: string, handler: Handler): unknown;
  };
  waitUntil(name: string): Promise<unknown> | null;
  contacts: {
    add(attributes: { jid: string; name?: string }): Promise<ContactModel>;
    remove(jid: string, unsubscribe?: boolean): Promise<void>;
  };
  chats: {
    get(jid: string): Promise<ChatModel | null | undefined>;
    open(jid: string): Promise<ChatModel | undefined>;
  };
  rooms: {
    get(
      jid: string,
      attributes?: { nick?: string; password?: string; hidden?: boolean },
      create?: boolean,
    ): Promise<RoomModel | null | undefined>;
  };
  bookmarks: {
    set(attributes: {
      jid: string;
      name?: string;
      nick?: string;
      autojoin?: boolean;
    }): Promise<unknown>;
    get(jid: string): Promise<BookmarkModel | undefined>;
  };
  disco: {
    info(jid: string, node?: string | null, options?: { timeout?: number }): Promise<Element>;
    items(jid: string, node?: string): Promise<Element>;
    getIdentity(category: string, type: string, jid: string): Promise<ModelLike | undefined>;
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
  Strophe: { Status: Record<string, number>; getBareJidFromJid(jid: string): string | null };
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
  _converse: { state: ConverseState };
  MAMPlaceholderMessage: new (...args: never[]) => unknown;
}
