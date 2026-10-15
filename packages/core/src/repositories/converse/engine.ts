import type {
  ConverseApi,
  ConverseEnv,
  ConverseHeadless,
  ConverseState,
  Handler,
  RoomStatus,
} from './models';

export type PersistentStore = 'IndexedDB' | 'localStorage';

export interface EngineOptions {
  /** `'localStorage'` in tests: jsdom has no IndexedDB (wiki/development/converse.md §11). */
  persistentStore?: PersistentStore;
  /** Converse's own test hook (§11): a `MockConnection` that never opens a socket. */
  mockConnection?: boolean;
  /** Converse at `loglevel: 'debug'`: every stanza, bodies included (§10). Never in production. */
  debug?: boolean;
}

export interface Loaded {
  api: ConverseApi;
  state: ConverseState;
  env: ConverseEnv;
  roomStatus: RoomStatus;
  MAMPlaceholderMessage: ConverseHeadless['MAMPlaceholderMessage'];
}

/**
 * Owns the one Converse instance of the process. `converse.initialize` runs once (its `cleanup`
 * drops every listener, including ours); a second sign-in reuses the instance and only calls
 * `api.user.login` again, which creates a fresh connection because `api.user.logout` destroys the
 * previous one (`shared/connection/api.js:60-64`). The package is imported lazily so that nothing
 * touches `window` until the first repository call (§11: import time needs a DOM).
 */
export class ConverseEngine {
  private loading: Promise<Loaded> | null = null;
  private loaded: Loaded | null = null;
  private readonly listeners = new Set<[string, Handler]>();
  private readonly readyHandlers: Array<(loaded: Loaded) => void> = [];

  constructor(private readonly options: EngineOptions = {}) {}

  /** What `ready()` resolved to, for handlers of Converse events (which only fire once loaded). */
  get current(): Loaded | null {
    return this.loaded;
  }

  ready(): Promise<Loaded> {
    if (!this.loading) {
      // A failed load (missing DOM, broken asset) must not be cached: the next call retries.
      this.loading = this.load().catch((error: unknown) => {
        this.loading = null;
        throw error;
      });
    }
    return this.loading;
  }

  /**
   * Runs once Converse is initialized, without triggering the initialization. Events fired during
   * `initialize` (`chatBoxesInitialized`...) cannot be observed, so collections are bound here.
   */
  onReady(handler: (loaded: Loaded) => void): void {
    this.readyHandlers.push(handler);
    if (this.loaded) handler(this.loaded);
  }

  /** Subscribes to a Converse event, before or after initialization. Returns the unsubscribe. */
  on(name: string, handler: Handler): () => void {
    const entry: [string, Handler] = [name, handler];
    this.listeners.add(entry);
    this.loaded?.api.listen.on(name, handler);
    return () => {
      this.listeners.delete(entry);
      this.loaded?.api.listen.not(name, handler);
    };
  }

  private async load(): Promise<Loaded> {
    const headless = (await import('@converse/headless')) as unknown as ConverseHeadless;
    const { converse, api, _converse, MAMPlaceholderMessage } = headless;
    silenceAlerts(api);
    await converse.initialize(this.settings());
    const loaded = {
      api,
      state: _converse.state,
      env: converse.env,
      roomStatus: converse.ROOMSTATUS,
      MAMPlaceholderMessage,
    };
    for (const [name, handler] of this.listeners) api.listen.on(name, handler);
    this.loaded = loaded;
    for (const handler of this.readyHandlers) handler(loaded);
    return loaded;
  }

  /** Settings from wiki/development/converse.md §1; the mock needs the BOSH plugin and no smacks. */
  private settings(): Record<string, unknown> {
    const mock = this.options.mockConnection === true;
    return {
      discover_connection_methods: false,
      blacklisted_plugins: mock ? [] : ['converse-bosh'],
      authentication: 'login',
      auto_login: false,
      keepalive: false,
      // SCRAM keys would let Converse re-authenticate without the password: secrets stay in the keychain.
      reuse_scram_keys: false,
      persistent_store: this.options.persistentStore ?? 'IndexedDB',
      view_mode: 'overlayed',
      allow_non_roster_messaging: true,
      auto_reconnect: true,
      enable_smacks: !mock,
      archived_messages_page_size: 50,
      mam_request_all_pages: false,
      send_chat_markers: ['received', 'displayed', 'acknowledged'],
      // At 'warn' and above Converse still logs whole stanzas on parse errors (§10): 'fatal' only.
      loglevel: this.options.debug ? 'debug' : 'fatal',
      assets_path: '',
      ...(mock ? { bosh_service_url: 'montague.lit/http-bind' } : {}),
    };
  }
}

/**
 * Converse calls `alert()` on roster IQ errors (§3) and `api.alert` on OMEMO send errors, which is
 * undefined in headless (§8). Both become a log line with the event name only: never the content.
 */
function silenceAlerts(api: ConverseApi): void {
  api.alert = () => console.warn('converse: alert suppressed');
  window.alert = () => console.warn('converse: window.alert suppressed');
}
