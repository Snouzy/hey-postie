import { DomainError, type ErrorCode } from '../../contracts/errors';
import type { XmppRepository } from '../../contracts/repositories';
import type { AccountState } from '../../contracts/types';
import type { ConverseEngine, Loaded } from './engine';
import type { ConnectionLike, ConverseApi } from './models';

type StateHandler = (state: AccountState, error?: DomainError) => void;

const DEFAULT_TIMEOUT_MS = 30_000;

/** The connection lifecycle of wiki/development/converse.md §2, mapped to `AccountState`. */
export class ConverseXmppRepository implements XmppRepository {
  private readonly handlers = new Set<StateHandler>();
  private online = false;
  /** The last AUTHFAIL or CONNFAIL seen, so that `disconnected` can carry a reason. */
  private failure: ErrorCode | null = null;

  constructor(
    private readonly engine: ConverseEngine,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    engine.on('connected', () => this.notifyOnline());
    engine.on('reconnected', () => this.notifyOnline());
    engine.on('will-reconnect', () => this.notify('connecting'));
    engine.on('disconnected', () => this.notifyOffline());
  }

  async connect(input: { jid: string; password: string; websocketUrl: string }): Promise<void> {
    const loaded = await this.engine.ready();
    const { api } = loaded;
    await settleDisconnection(api);
    api.settings.set('websocket_url', input.websocketUrl);
    // A failed first attempt must report an error, not loop: Converse reconnects on CONNFAIL
    // (`shared/connection/index.js:333`). The `connected` handler enables reconnection again; a
    // `finally` here would be too early, the disconnect cascade still runs after the rejection.
    api.settings.set('auto_reconnect', false);
    this.failure = null;
    await this.awaitConnection(loaded, () => api.user.login(input.jid, input.password));
  }

  async disconnect(): Promise<void> {
    const { api } = await this.engine.ready();
    await api.user.logout();
    await settleDisconnection(api);
  }

  onStateChange(handler: StateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Resolves on `connected` once the roster and the chats are loaded, rejects on failure. */
  private awaitConnection(loaded: Loaded, login: () => Promise<void>): Promise<void> {
    const { api, state, env } = loaded;
    const { Status } = env.Strophe;
    const closeReason = { value: '' };
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

      subscriptions.push(
        this.engine.on('connectionInitialized', () => {
          const connection = api.connection.get();
          if (connection) captureCloseReason(connection, Status, closeReason);
        }),
        this.engine.on('connfeedback', () => {
          const status = state.connfeedback.get('connection_status');
          const message = state.connfeedback.get('message');
          if (status === Status.AUTHFAIL) fail('InvalidCredentials', message);
          else if (status === Status.CONNFAIL) fail(connfailCode(closeReason.value), message);
          else if (status === Status.DISCONNECTED) fail('ServerUnreachable', message);
        }),
        this.engine.on('connected', () => {
          api.settings.set('auto_reconnect', true);
          Promise.all([api.waitUntil('rosterContactsFetched'), api.waitUntil('chatBoxesFetched')])
            .then(() => settle(resolve))
            .catch((error) => fail('Unknown', error));
        }),
      );
      login().catch((error) => fail('ServerUnreachable', error));
    });
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
 * Strophe discards the WebSocket close reason, and does nothing at all when the socket closes
 * cleanly before the stream opened (`strophe.js/src/websocket.js:360-378`). The relay closes with
 * reason `CertificateInvalid` in that very state, so we keep the reason and turn such a close
 * into a CONNFAIL that Converse then handles like any other.
 */
function captureCloseReason(
  connection: ConnectionLike,
  Status: Record<string, number>,
  closeReason: { value: string },
): void {
  const proto = connection._proto;
  const original = proto?._onClose;
  if (!proto || !original) return;
  proto._onClose = (event: CloseEvent) => {
    closeReason.value = event?.reason ?? '';
    if (!connection.connected && event?.code !== 1006) {
      connection._changeConnectStatus(Status.CONNFAIL ?? 2, event?.reason || 'closed');
      connection._doDisconnect();
      return;
    }
    original.call(proto, event);
  };
}

function connfailCode(closeReason: string): ErrorCode {
  return closeReason === 'CertificateInvalid' ? 'CertificateInvalid' : 'ServerUnreachable';
}

/**
 * `api.user.logout` resolves on the first `disconnected`, but `finishDisconnection` calls
 * `api.connection.destroy()`, whose `disconnect()` on the already closed connection re-enters the
 * same path twice (`shared/connection/index.js:283-300`, `api.js:60-64`). Those late passes destroy
 * whatever connection exists at that moment, including a new login's. So we wait until no
 * connection has existed for a few ticks before creating one.
 */
async function settleDisconnection(api: ConverseApi): Promise<void> {
  const deadline = Date.now() + 2000;
  let quietTicks = 0;
  while (Date.now() < deadline && quietTicks < 3) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    quietTicks = api.connection.get() === undefined ? quietTicks + 1 : 0;
  }
}
