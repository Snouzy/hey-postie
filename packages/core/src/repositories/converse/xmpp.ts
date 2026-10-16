import { DomainError, type ErrorCode } from '../../contracts/errors';
import type { XmppRepository } from '../../contracts/repositories';
import type { AccountState } from '../../contracts/types';
import type { ConverseEngine, Loaded } from './engine';
import { bareJid } from './mappers';
import type { ConnectionLike, ConverseApi, ModelLike } from './models';
import { wrapSocketClose } from './socketClose';

type StateHandler = (state: AccountState, error?: DomainError) => void;
type ConnectInput = Parameters<XmppRepository['connect']>[0];

const DEFAULT_TIMEOUT_MS = 30_000;
const SETTLE_TIMEOUT_MS = 2_000;

/** The connection lifecycle of wiki/development/converse.md §2, mapped to `AccountState`. */
export class ConverseXmppRepository implements XmppRepository {
  private readonly handlers = new Set<StateHandler>();
  private online = false;
  /** The last AUTHFAIL or CONNFAIL seen, so that `disconnected` carries a reason. */
  private failure: ErrorCode | null = null;
  /** The reason of the last WebSocket close, which Strophe discards (see `wrapSocketClose`). */
  private closeReason = '';
  /** `connect` and `disconnect` run one after the other: a double sign-in must not open two connections. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly engine: ConverseEngine,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    engine.on('connectionInitialized', () => this.wrapSocketClose());
    engine.on('connfeedback', (feedback) => this.recordFailure(feedback as ModelLike));
    engine.on('reconnected', () => this.notifyOnline());
    engine.on('will-reconnect', () => this.notify('connecting'));
    engine.on('disconnected', () => this.notifyOffline());
  }

  connect(input: ConnectInput): Promise<void> {
    return this.serialize(() => this.doConnect(input));
  }

  disconnect(): Promise<void> {
    return this.serialize(async () => {
      const { api } = await this.engine.ready();
      await api.user.logout();
      await this.settleDisconnection(api);
    });
  }

  onStateChange(handler: StateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // Presence and the own avatar are not implemented yet: see wiki/development/converse.md
  // "To implement". Sending refuses, nothing fires.
  async setPresence(): Promise<void> {
    throw new DomainError('Unknown', 'Unknown: not implemented yet in the Converse repository');
  }

  onAvatarChange(): () => void {
    return () => undefined;
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doConnect(input: ConnectInput): Promise<void> {
    const loaded = await this.engine.ready();
    const { api } = loaded;
    const current = api.connection.get();
    if (this.online && current?.jid && bareJid(current.jid) === bareJid(input.jid)) return;
    if (current) await api.user.logout();
    await this.settleDisconnection(api);
    api.settings.set('websocket_url', input.websocketUrl);
    // A failed first attempt must report an error, not loop: Converse reconnects on CONNFAIL
    // (`shared/connection/index.js:333`). The `connected` handler enables reconnection again; a
    // `finally` here would be too early, the disconnect cascade still runs after the rejection.
    api.settings.set('auto_reconnect', false);
    this.failure = null;
    let reachedConnected = false;
    try {
      await this.awaitConnection(loaded, input, () => {
        reachedConnected = true;
      });
    } catch (error) {
      // Converse did go through `connected` (and `disconnected`): the account is in error, not offline.
      if (reachedConnected && error instanceof DomainError) this.notify('error', error);
      throw error;
    }
    this.notifyOnline();
  }

  /** Resolves on `connected` once the roster and the chats are loaded, rejects on failure. */
  private awaitConnection(loaded: Loaded, input: ConnectInput, onConnected: () => void) {
    const { api, state, env } = loaded;
    const { Status } = env.Strophe;
    return new Promise<void>((resolve, reject) => {
      const subscriptions: Array<() => void> = [];
      const settle = (outcome: () => void) => {
        clearTimeout(timer);
        for (const unsubscribe of subscriptions) unsubscribe();
        outcome();
      };
      const fail = (code: ErrorCode, detail?: unknown) =>
        settle(() => reject(new DomainError(code, `${code}: ${String(detail ?? '')}`.trim())));
      const timer = setTimeout(() => {
        api.user.logout().catch(() => undefined);
        fail('ServerUnreachable', 'timeout');
      }, this.timeoutMs);

      // Only `logout` renews Converse's promises: after a drop, `api.waitUntil('rosterContactsFetched')`
      // is still resolved from the previous session. So we count this attempt's events instead.
      const pending = new Set(['connected', 'rosterContactsFetched', 'chatBoxesFetched']);
      const arrived = (name: string) => {
        pending.delete(name);
        if (pending.size === 0) settle(resolve);
      };
      subscriptions.push(
        this.engine.on('rosterContactsFetched', () => arrived('rosterContactsFetched')),
        this.engine.on('chatBoxesFetched', () => arrived('chatBoxesFetched')),
        // Runs after `recordFailure`, which was registered first: `this.failure` is up to date.
        this.engine.on('connfeedback', () => {
          const status = state.connfeedback.get('connection_status');
          const message = state.connfeedback.get('message');
          if (status === Status.AUTHFAIL || status === Status.CONNFAIL) {
            fail(this.failure ?? 'ServerUnreachable', message);
          } else if (status === Status.DISCONNECTED) {
            fail('ServerUnreachable', message);
          }
        }),
        this.engine.on('connected', () => {
          onConnected();
          api.settings.set('auto_reconnect', true);
          arrived('connected');
        }),
      );
      api.user.login(input.jid, input.password).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        fail(/jid/i.test(message) ? 'InvalidJid' : 'ServerUnreachable', message);
      });
    });
  }

  /** Keeps the WebSocket close reason (`socketClose.ts`): the relay says `CertificateInvalid` there. */
  private wrapSocketClose(): void {
    this.closeReason = '';
    const loaded = this.engine.current;
    if (!loaded) return;
    const { api, env } = loaded;
    const connection = api.connection.get();
    if (connection) silenceStanzaLog(connection);
    const { CONNFAIL = 2 } = env.Strophe.Status;
    const wrapped =
      connection &&
      wrapSocketClose(connection, CONNFAIL, (reason) => {
        this.closeReason = reason;
      });
    if (!wrapped) {
      console.warn('converse: transport has no _onClose to wrap, close reasons are unavailable');
    }
  }

  private recordFailure(feedback: ModelLike): void {
    const Status = this.engine.current?.env.Strophe.Status;
    const status = feedback.get('connection_status');
    if (status === Status?.AUTHFAIL) this.failure = 'InvalidCredentials';
    else if (status === Status?.CONNFAIL) {
      this.failure =
        this.closeReason === 'CertificateInvalid' ? 'CertificateInvalid' : 'ServerUnreachable';
    }
  }

  /**
   * `api.user.logout` resolves on the first `disconnected`, but `finishDisconnection` calls
   * `api.connection.destroy()`, whose `disconnect()` on the already closed connection re-enters the
   * same path twice (`shared/connection/index.js:283-300`, `api.js:60-64`). Those late passes destroy
   * whatever connection exists at that moment, including a new login's. So we wait until the
   * connection object is gone and a tick passes without another `disconnected`, within a bound.
   */
  private async settleDisconnection(api: ConverseApi): Promise<void> {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    let disconnectedAgain = false;
    const unsubscribe = this.engine.on('disconnected', () => {
      disconnectedAgain = true;
    });
    try {
      do {
        disconnectedAgain = false;
        await new Promise((resolve) => setTimeout(resolve, 10));
      } while (Date.now() < deadline && (api.connection.get() !== undefined || disconnectedAgain));
    } finally {
      unsubscribe();
    }
  }

  private notifyOnline(): void {
    this.online = true;
    this.failure = null;
    this.notify('online');
  }

  /** `disconnected` also fires for a failed sign-in and for Converse's logout cascade: only a drop counts. */
  private notifyOffline(): void {
    if (!this.online) return;
    this.online = false;
    const error = this.failure ? new DomainError(this.failure) : undefined;
    this.notify('offline', error);
  }

  private notify(state: AccountState, error?: DomainError): void {
    for (const handler of this.handlers) handler(state, error);
  }
}

/**
 * Converse's `xmlInput`/`xmlOutput` serialize every stanza (`body.outerHTML`) for a debug line
 * that the log level then drops (`shared/connection/index.js:32-39`). We never log stanzas, and
 * jsdom's strict XML serializer throws on Strophe's `xmlns` attributes, which aborts the
 * connection before the stream opens. So neither hook does anything.
 */
function silenceStanzaLog(connection: ConnectionLike): void {
  connection.xmlInput = () => undefined;
  connection.xmlOutput = () => undefined;
}
