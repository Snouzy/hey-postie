// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../contracts/errors';
import { createConverseRepositories } from './index';

/**
 * Drives the real Strophe connection of `ConverseRegistrationRepository` over a scripted
 * WebSocket: no server, the "server" is a function answering each frame. Converse itself is
 * initialized (the repository takes `Strophe` from `converse.env`) but never logs in.
 */

type Frame = { data: string };
type ServerScript = (socket: ScriptedSocket, frame: string) => void;

class ScriptedSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static script: ServerScript = () => undefined;
  static opened: ScriptedSocket[] = [];

  readyState = ScriptedSocket.CONNECTING;
  readonly sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: Frame) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocol: string,
  ) {
    ScriptedSocket.opened.push(this);
    queueMicrotask(() => {
      this.readyState = ScriptedSocket.OPEN;
      this.onopen?.();
    });
  }

  send(data: string): void {
    this.sent.push(data);
    queueMicrotask(() => ScriptedSocket.script(this, data));
  }

  close(): void {
    this.readyState = ScriptedSocket.CLOSED;
  }

  /** Server side. */
  reply(xml: string): void {
    this.onmessage?.({ data: xml });
  }

  closeFromServer(code: number, reason = ''): void {
    this.readyState = ScriptedSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

const OPEN = `<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" from="example.org" id="s1" version="1.0"/>`;
const CLOSE = '<close xmlns="urn:ietf:params:xml:ns:xmpp-framing" />';
const features = (register: boolean) =>
  `<stream:features xmlns:stream="http://etherx.jabber.org/streams"><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms>${
    register ? '<register xmlns="http://jabber.org/features/iq-register"/>' : ''
  }</stream:features>`;
const XDATA_FORM = `<query xmlns="jabber:iq:register"><instructions>legacy</instructions><username/><password/>
  <x xmlns="jabber:x:data" type="form"><instructions>Pick a name</instructions>
    <field var="FORM_TYPE" type="hidden"><value>jabber:iq:register</value></field>
    <field var="username" type="text-single" label="Username"><required/></field>
    <field var="password" type="text-private" label="Password"><required/></field>
  </x></query>`;
const LEGACY_FORM = `<query xmlns="jabber:iq:register"><username/><password/></query>`;
const iqError = (condition: string) =>
  `<error type="cancel"><${condition} xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error>`;

const idOf = (frame: string) => /\bid="([^"]+)"/.exec(frame)?.[1] ?? '';

/** A server with in-band registration: `onSet` decides what the registration attempt gets. */
function server(options: {
  register?: boolean;
  form?: string;
  onGet?: string;
  onSet?: (frame: string) => string;
}): ServerScript {
  return (socket, frame) => {
    if (frame.startsWith('<open ')) {
      socket.reply(OPEN);
      socket.reply(features(options.register ?? true));
    } else if (frame.startsWith('<close')) {
      socket.reply(CLOSE);
      socket.closeFromServer(1000);
    } else if (frame.includes('type="get"')) {
      const body = options.onGet
        ? `<iq type="error" id="${idOf(frame)}">${options.onGet}</iq>`
        : `<iq type="result" id="${idOf(frame)}">${options.form ?? XDATA_FORM}</iq>`;
      socket.reply(body);
    } else if (frame.includes('type="set"')) {
      const error = options.onSet?.(frame);
      socket.reply(
        error
          ? `<iq type="error" id="${idOf(frame)}">${error}</iq>`
          : `<iq type="result" id="${idOf(frame)}"/>`,
      );
    }
  };
}

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  connectTimeoutMs: 500,
});
const target = { domain: 'example.org', websocketUrl: 'wss://example.org/ws' };
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof DomainError ? error.code : String(error)),
  );

beforeAll(() => {
  window.fetch = () => Promise.reject(new Error('no network in tests'));
  globalThis.WebSocket = ScriptedSocket as unknown as typeof WebSocket;
});

beforeEach(() => {
  ScriptedSocket.opened = [];
  ScriptedSocket.script = server({});
});

describe('ConverseRegistrationRepository over a scripted WebSocket', () => {
  it('fetches the form on an unauthenticated stream and keeps the stream for submit', async () => {
    const form = await repositories.registration.form(target);
    expect(form.domain).toBe('example.org');
    expect(form.instructions).toBe('Pick a name');
    expect(form.fields.map((f) => [f.name, f.type])).toEqual([
      ['FORM_TYPE', 'hidden'],
      ['username', 'text'],
      ['password', 'password'],
    ]);
    const [socket] = ScriptedSocket.opened;
    expect(ScriptedSocket.opened).toHaveLength(1);
    expect(socket?.protocol).toBe('xmpp');
    expect(socket?.sent.some((f) => f.includes('urn:ietf:params:xml:ns:xmpp-sasl'))).toBe(false);

    await repositories.registration.submit({
      ...target,
      values: { username: 'bob', password: 'pw' },
    });
    expect(ScriptedSocket.opened).toHaveLength(1);
    const set = socket?.sent.find((f) => f.includes('type="set"')) ?? '';
    expect(set).toContain('<x type="submit" xmlns="jabber:x:data">');
    expect(set).toContain('<field var="FORM_TYPE"><value>jabber:iq:register</value></field>');
    expect(set).toContain('<field var="password"><value>pw</value></field>');
    expect(socket?.sent.at(-1)).toContain('<close');
  });

  it('reopens a stream when the server closed the first one, and maps conflict', async () => {
    ScriptedSocket.script = server({ form: LEGACY_FORM, onSet: () => iqError('conflict') });
    await repositories.registration.form(target);
    ScriptedSocket.opened[0]?.closeFromServer(1000);
    await expect(
      failure(
        repositories.registration.submit({
          ...target,
          values: { username: 'bob', password: 'pw' },
        }),
      ),
    ).resolves.toBe('AccountConflict');
    expect(ScriptedSocket.opened).toHaveLength(2);
    const set = ScriptedSocket.opened[1]?.sent.find((f) => f.includes('type="set"')) ?? '';
    expect(set).toContain('<username>bob</username><password>pw</password>');
  });

  it('maps not-acceptable to RegistrationRejected and a refused form to RegistrationUnsupported', async () => {
    ScriptedSocket.script = server({ onSet: () => iqError('not-acceptable') });
    await expect(
      failure(
        repositories.registration.submit({ ...target, values: { username: 'b', password: 'p' } }),
      ),
    ).resolves.toBe('RegistrationRejected');
    ScriptedSocket.script = server({ onGet: iqError('not-allowed') });
    await expect(failure(repositories.registration.form(target))).resolves.toBe(
      'RegistrationUnsupported',
    );
  });

  it('rejects a server without the register feature before any IQ', async () => {
    ScriptedSocket.script = server({ register: false });
    await expect(failure(repositories.registration.form(target))).resolves.toBe(
      'RegistrationUnsupported',
    );
    expect(ScriptedSocket.opened[0]?.sent.some((f) => f.includes('jabber:iq:register'))).toBe(
      false,
    );
  });

  it('reads the relay close reason and times out on a silent server', async () => {
    ScriptedSocket.script = (socket, frame) => {
      if (frame.startsWith('<open ')) socket.closeFromServer(1000, 'CertificateInvalid');
    };
    await expect(failure(repositories.registration.form(target))).resolves.toBe(
      'CertificateInvalid',
    );
    ScriptedSocket.script = () => undefined;
    await expect(failure(repositories.registration.form(target))).resolves.toBe(
      'ServerUnreachable',
    );
  });

  it('wipeLocal removes the account stores and keys, nothing else', async () => {
    localStorage.setItem(
      'converse-persistent/bob@example.org/converse.roster-bob@example.org',
      '1',
    );
    localStorage.setItem(
      'converse-persistent/alice@example.org/converse.roster-alice@example.org',
      '1',
    );
    localStorage.setItem('hey-postie:bob@example.org:drafts', '1');
    localStorage.setItem('conversejs-session-jid', 'bob@example.org');
    await repositories.registration.wipeLocal('Bob@example.org');
    expect(Object.keys(localStorage).filter((k) => k.includes('bob@'))).toEqual([]);
    expect(localStorage.getItem('conversejs-session-jid')).toBeNull();
    expect(
      localStorage.getItem(
        'converse-persistent/alice@example.org/converse.roster-alice@example.org',
      ),
    ).toBe('1');
  });
});
