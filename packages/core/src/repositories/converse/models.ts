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
  alert?: Handler;
}

export interface ConverseState {
  connfeedback: ModelLike;
  session?: ModelLike;
  roster?: CollectionLike<ContactModel>;
  chatboxes?: CollectionLike<ChatModel>;
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
  converse: { initialize(settings: Record<string, unknown>): Promise<unknown>; env: ConverseEnv };
  api: ConverseApi;
  _converse: { state: ConverseState };
  MAMPlaceholderMessage: new (...args: never[]) => unknown;
}
