import { DomainError, type ErrorCode } from '../../contracts/errors';
import type { RegistrationRepository } from '../../contracts/repositories';
import type { RegistrationForm } from '../../contracts/types';
import type { ConverseEngine, Loaded } from './engine';
import type { StropheConnection } from './models';
import {
  buildFormRequestIq,
  buildRemoveIq,
  buildSubmitIq,
  errorOf,
  NS,
  type ParsedRegistration,
  parseRegistrationQuery,
} from './registrationForm';
import { wrapSocketClose } from './socketClose';

type Target = { domain: string; websocketUrl: string };
type SubmitInput = Target & { values: Record<string, string> };

const DEFAULT_TIMEOUT_MS = 20_000;
/** localForage database and key prefix of Converse's per-account store (`utils/init.js:130-136`). */
const PERSISTENT_STORE = 'converse-persistent';
const SESSION_JID_KEY = 'conversejs-session-jid';
const OWN_KEY_PREFIX = 'hey-postie:';

/** An unauthenticated stream kept open between `form` and `submit`, with what the server asked. */
interface PendingRegistration extends Target {
  connection: StropheConnection;
  parsed: ParsedRegistration;
}

/**
 * XEP-0077 over a bare `Strophe.Connection` of our own, separate from Converse's login connection
 * (wiki/development/converse.md, "Registration"). `form` leaves the stream open so that `submit`
 * answers on the same session, which a CAPTCHA challenge requires; when the server has dropped it
 * meanwhile, `submit` reopens one and fetches the form again. `deleteCurrent` and `wipeLocal` go
 * through the signed-in Converse instance.
 */
export class ConverseRegistrationRepository implements RegistrationRepository {
  private pending: PendingRegistration | null = null;
  /** What `exchange` is waiting on per stream, rejected when the server closes it meanwhile. */
  private readonly dropped = new Map<StropheConnection, () => void>();

  constructor(
    private readonly engine: ConverseEngine,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async form(target: Target): Promise<RegistrationForm> {
    this.closePending();
    this.pending = await this.open(target);
    return this.pending.parsed.form;
  }

  /**
   * `values` holds the visible fields only (username, password, email..., the CAPTCHA answer under
   * `captchaField`): `RegistrationField` carries no value, so the UI never sees the hidden ones.
   * The form kept from `form()` supplies them (`FORM_TYPE`, CAPTCHA `challenge`/`sid`...) through
   * `buildSubmitIq`. After a reopened stream they come from the freshly fetched form instead, which
   * is right for `FORM_TYPE` but not for a CAPTCHA: its challenge belongs to the first stream.
   */
  async submit({ domain, websocketUrl, values }: SubmitInput): Promise<void> {
    const reusable =
      this.pending?.domain === domain &&
      this.pending.websocketUrl === websocketUrl &&
      this.pending.connection.connected;
    const pending =
      reusable && this.pending ? this.pending : await this.open({ domain, websocketUrl });
    this.pending = null;
    const { connection, parsed } = pending;
    try {
      const id = connection.getUniqueId('register');
      const reply = await this.exchange(connection, buildSubmitIq(id, parsed, values), id);
      if (reply.getAttribute('type') === 'error') throw registrationError(reply);
    } finally {
      connection.disconnect();
    }
  }

  async deleteCurrent(): Promise<void> {
    const { api } = await this.engine.ready();
    try {
      await api.sendIQ(buildRemoveIq(`remove-${Date.now().toString(36)}`));
    } catch (error) {
      if (error instanceof Element) throw registrationError(error);
      throw new DomainError('ServerUnreachable', 'ServerUnreachable: no answer to the removal');
    }
  }

  /**
   * Converse keeps everything of an account (roster, chats, messages, OMEMO keys, settings) in one
   * localForage store named after the bare JID: the IndexedDB object store `<jid>` of the
   * `converse-persistent` database, or the `converse-persistent/<jid>/` keys of localStorage. Also
   * gone: the auto-login JID (`conversejs-session-jid`) and our `hey-postie:<jid>:` keys.
   */
  async wipeLocal(jid: string): Promise<void> {
    const bare = jid.toLowerCase();
    removeKeys(localStorage, (key) => key.startsWith(`${PERSISTENT_STORE}/${bare}/`));
    removeKeys(localStorage, (key) => key.startsWith(`${OWN_KEY_PREFIX}${bare}:`));
    if (localStorage.getItem(SESSION_JID_KEY) === bare) localStorage.removeItem(SESSION_JID_KEY);
    const persistent = this.engine.current?.storage.persistent;
    if (!persistent) return;
    // Best effort: the account is already gone from the server, and the keys above are removed.
    await persistent
      .dropInstance({ name: PERSISTENT_STORE, storeName: bare })
      .catch(() => console.warn('converse: could not drop the persistent store of the account'));
  }

  /** Opens an unauthenticated stream to the domain and fetches its registration form. */
  private async open(target: Target): Promise<PendingRegistration> {
    const loaded = await this.engine.ready();
    const connection = new loaded.env.Strophe.Connection(target.websocketUrl);
    try {
      await this.awaitStreamFeatures(loaded, connection, target.domain);
      const id = connection.getUniqueId('register');
      const reply = await this.exchange(connection, buildFormRequestIq(id), id);
      if (reply.getAttribute('type') === 'error') throw registrationError(reply);
      const query = reply.getElementsByTagNameNS(NS.register, 'query')[0];
      if (!query)
        throw new DomainError('RegistrationUnsupported', 'RegistrationUnsupported: no form');
      return { ...target, connection, parsed: parseRegistrationQuery(query, target.domain) };
    } catch (error) {
      connection.disconnect();
      throw error;
    }
  }

  /**
   * `connect(domain, '')` with Strophe's `_connect_cb` replaced, as Converse's register plugin
   * does: we read the stream features ourselves and never start SASL. Resolves once the server
   * advertises `<register/>`; rejects on CONNFAIL / DISCONNECTED / timeout.
   */
  private awaitStreamFeatures(
    loaded: Loaded,
    connection: StropheConnection,
    domain: string,
  ): Promise<void> {
    const { Status } = loaded.env.Strophe;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        outcome();
      };
      const fail = (code: ErrorCode, detail: string) =>
        settle(() => reject(new DomainError(code, `${code}: ${detail}`.trim())));
      const timer = setTimeout(() => fail('ServerUnreachable', 'timeout'), this.timeoutMs);

      let closeReason = '';
      wrapSocketClose(connection, Status.CONNFAIL ?? 2, (reason) => {
        closeReason = reason;
      });
      connection._connect_cb = (body) => {
        connection.connected = true;
        if (connection._proto._connect_cb(body) === Status.CONNFAIL) return;
        const register = body.getElementsByTagNameNS(NS.registerFeature, 'register');
        if (register.length === 0) {
          fail('RegistrationUnsupported', 'RegistrationUnsupported: no <register/> feature');
          return;
        }
        settle(resolve);
      };
      connection.connect(domain, '', (status, condition) => {
        if (status === Status.CONNFAIL) {
          const code =
            closeReason === 'CertificateInvalid' ? 'CertificateInvalid' : 'ServerUnreachable';
          fail(code, condition ?? '');
        } else if (status === Status.DISCONNECTED) {
          fail('ServerUnreachable', condition ?? 'disconnected');
          this.dropped.get(connection)?.();
        }
      });
    });
  }

  /** Sends an IQ on the unauthenticated stream and resolves with the reply of the same id. */
  private exchange(connection: StropheConnection, iq: Element, id: string): Promise<Element> {
    return new Promise<Element>((resolve, reject) => {
      const fail = (detail: string) => {
        clearTimeout(timer);
        this.dropped.delete(connection);
        reject(new DomainError('ServerUnreachable', `ServerUnreachable: ${detail}`));
      };
      const timer = setTimeout(() => fail('timeout'), this.timeoutMs);
      this.dropped.set(connection, () => fail('stream closed'));
      connection._addSysHandler(
        (stanza) => {
          clearTimeout(timer);
          this.dropped.delete(connection);
          resolve(stanza);
          return false;
        },
        null,
        'iq',
        null,
        id,
      );
      connection.send(iq);
    });
  }

  private closePending(): void {
    this.pending?.connection.disconnect();
    this.pending = null;
  }
}

/** XEP-0077 §3.1-3.2 error conditions, Prosody's `mod_register_ibr` included. */
function registrationError(stanza: Element): DomainError {
  const { condition, text } = errorOf(stanza);
  const codes: Record<string, ErrorCode> = {
    conflict: 'AccountConflict',
    'not-acceptable': 'RegistrationRejected',
    'bad-request': 'RegistrationRejected',
    'not-allowed': 'RegistrationUnsupported',
    forbidden: 'RegistrationUnsupported',
    'service-unavailable': 'RegistrationUnsupported',
  };
  const code = codes[condition] ?? 'Unknown';
  return new DomainError(code, `${code}: ${condition}${text ? ` (${text})` : ''}`);
}

function removeKeys(storage: Storage, matches: (key: string) => boolean): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && matches(key)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
