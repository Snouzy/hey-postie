import type { ConverseRepositories } from '../index';

/**
 * Converse's own test hook (wiki/development/converse.md §11): a `MockConnection` that never
 * opens a socket, stanzas injected with `_dataRecv`, IQs answered by hand. One Converse instance
 * per test file (Vitest isolates files); the cases of a file run in order and share it.
 */

export interface Mock {
  api: {
    connection: { get(): MockConnection | undefined };
    listen: {
      on(name: string, handler: (...args: never[]) => void): void;
      once(name: string, handler: (...args: never[]) => void): void;
    };
    user: { logout(): Promise<void>; settings: { clear(): Promise<unknown> } };
    waitUntil(name: string): Promise<unknown> | null;
  };
  _converse: {
    state: { chatboxes: { get(jid: string): { get(key: string): unknown } | undefined } };
  };
  converse: {
    env: {
      Strophe: {
        Status: Record<string, number>;
        NS: { ROSTER: string; DISCO_INFO: string; DISCO_ITEMS: string; MAM: string; MUC: string };
        Bosh: { prototype: { _onClose?: (event: { code: number; reason: string }) => void } };
        Request: new (stanza: Element, callback: () => void) => { getResponse(): Element };
        Builder: new (name: string, attrs: Record<string, string>) => { tree(): Element };
      };
      stx: (strings: TemplateStringsArray, ...values: unknown[]) => Stanza;
      sizzle: (selector: string, element: Element) => Element[];
      u: { waitUntil<T>(condition: () => T): Promise<T> };
    };
  };
}

export interface Stanza {
  tree(): Element;
}

export interface MockConnection {
  jid: string;
  connected: boolean;
  IQ_stanzas: Element[];
  sent_stanzas: Element[];
  _proto: {
    _connect: () => void;
    _onClose: (event: { code: number; reason: string }) => void;
  };
  _changeConnectStatus(status: number, condition?: string): void;
  _dataRecv(request: unknown): void;
}

export const JID = 'romeo@montague.lit';
export const JULIET = 'juliet@montague.lit';
export const MERCUTIO = 'mercutio@montague.lit';

export class MockHarness {
  private constructor(
    readonly mock: Mock,
    private readonly repositories: ConverseRepositories,
  ) {}

  static async create(repositories: ConverseRepositories): Promise<MockHarness> {
    // Same module instance as the engine's lazy import: the singleton is shared.
    const mock = (await import('@converse/headless')) as unknown as Mock;
    // Converse fetches `emoji.json` on the first message parse and logs the refusal once (an empty
    // table instead would break its parser and silently drop every later message).
    window.fetch = () => Promise.reject(new Error('no network in tests'));
    // `converse.initialize` drops every listener: initialize (a no-op sign-out) before hooking events.
    await repositories.xmpp.disconnect();
    // Test-env only: `isTestEnv()` makes every disconnect clear the cache, and the logout cascade
    // runs `clearUserSettings` concurrently, which races on its module variable (converse.md §12).
    const clear = mock.api.user.settings.clear.bind(mock.api.user.settings);
    mock.api.user.settings.clear = () => clear().catch(() => undefined);
    // The mock transport is BOSH, which has no `_onClose`: this stub stands in for Strophe's WebSocket
    // one, so that the repository can wrap it. The real close path is not reachable without a socket.
    mock.converse.env.Strophe.Bosh.prototype._onClose = () => undefined;
    return new MockHarness(mock, repositories);
  }

  get env(): Mock['converse']['env'] {
    return this.mock.converse.env;
  }

  connection(): Promise<MockConnection> {
    return this.env.u.waitUntil(() => this.mock.api.connection.get() as MockConnection);
  }

  inject(stanza: Stanza): void {
    const { Strophe } = this.env;
    const connection = this.mock.api.connection.get();
    if (!connection) throw new Error('no connection');
    const tree = stanza.tree();
    const request = new Strophe.Request(tree, () => undefined);
    request.getResponse = () => {
      const envelope = new Strophe.Builder('env', { type: 'mock' }).tree();
      envelope.appendChild(tree);
      return envelope;
    };
    connection._dataRecv(request);
  }

  /** Answers the roster IQ with two contacts, which lets `rosterContactsFetched` fire. */
  async answerRoster(): Promise<void> {
    const { u, sizzle, stx, Strophe } = this.env;
    const conn = await this.connection();
    const selector = `iq[type="get"] query[xmlns="${Strophe.NS.ROSTER}"]`;
    const iq = await u.waitUntil(() =>
      conn.IQ_stanzas.filter((stanza) => sizzle(selector, stanza).length).pop(),
    );
    this.inject(stx`<iq to="${conn.jid}" type="result" id="${iq?.getAttribute('id')}" xmlns="jabber:client">
      <query xmlns="jabber:iq:roster">
        <item jid="${JULIET}" name="Juliet" subscription="both"/>
        <item jid="${MERCUTIO}" subscription="to"/>
      </query>
    </iq>`);
  }

  async connectAndLoadRoster(password = 'secret'): Promise<void> {
    const connecting = this.repositories.xmpp.connect({ jid: JID, password, websocketUrl: '' });
    await this.answerRoster();
    await connecting;
  }

  /** Patches the next connection so that connecting ends in the given Strophe status. */
  failNextConnectionWith(outcome: (connection: MockConnection) => void): void {
    this.mock.api.listen.once('connectionInitialized', () => {
      const connection = this.mock.api.connection.get();
      if (connection) connection._proto._connect = () => outcome(connection);
    });
  }

  /** Simulates the relay closing the WebSocket before the stream opened (see `create`). */
  closeNextSocketWith(code: number, reason: string): void {
    this.failNextConnectionWith((connection) => connection._proto._onClose({ code, reason }));
  }

  nextEvent(name: string): Promise<void> {
    return new Promise((resolve) => this.mock.api.listen.once(name, () => resolve()));
  }

  /**
   * Answers, as they are sent, the IQs for which `reply` returns a stanza (the `id` and `to` are
   * filled in). Returns the function that stops answering.
   */
  autoAnswer(reply: (iq: Element) => Stanza | undefined): () => void {
    const answered = new WeakSet<Element>();
    const timer = setInterval(() => {
      const connection = this.mock.api.connection.get();
      for (const iq of connection?.IQ_stanzas ?? []) {
        if (answered.has(iq) || !['get', 'set'].includes(iq.getAttribute('type') ?? '')) continue;
        answered.add(iq);
        const answer = reply(iq);
        if (!answer) continue;
        const tree = answer.tree();
        tree.setAttribute('id', iq.getAttribute('id') ?? '');
        tree.setAttribute('to', connection?.jid ?? '');
        if (iq.getAttribute('to')) tree.setAttribute('from', iq.getAttribute('to') ?? '');
        this.inject({ tree: () => tree });
      }
    }, 5);
    return () => clearInterval(timer);
  }
}
