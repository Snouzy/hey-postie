// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '../../contracts/errors';
import { createConverseRepositories } from './index';
import { serveHeadlessAssets } from './test-support/realSocket';

/**
 * An account on a server without PEP: Converse's `initOMEMO` still ends in `OMEMOInitialized`
 * (`api.pubsub.publish` only warns), so the repository checks the account's disco identity itself
 * and answers at once. Its own engine, hence its own file (one Converse instance per process).
 */

interface Mock {
  api: {
    connection: { get(): MockConnection | undefined };
    user: { settings: { clear(): Promise<unknown> } };
    waitUntil(name: string): Promise<unknown> | null;
  };
  converse: {
    env: {
      Strophe: {
        NS: Record<string, string>;
        Bosh: { prototype: { _onClose?: (event: { code: number; reason: string }) => void } };
        Request: new (stanza: Element, callback: () => void) => { getResponse(): Element };
        Builder: new (name: string, attrs: Record<string, string>) => { tree(): Element };
      };
      sizzle: (selector: string, element: Element) => Element[];
    };
  };
}

interface MockConnection {
  jid: string;
  IQ_stanzas: Element[];
  _dataRecv(request: unknown): void;
}

const JID = 'romeo@montague.lit';
const JULIET = 'juliet@montague.lit';
const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  mockConnection: true,
  connectTimeoutMs: 5_000,
});
let mock: Mock;
let responder: ReturnType<typeof setInterval>;
const answered = new WeakSet<Element>();

function inject(xml: string): void {
  const { Strophe } = mock.converse.env;
  const connection = mock.api.connection.get();
  if (!connection) throw new Error('no connection');
  const tree = new DOMParser().parseFromString(xml, 'text/xml').documentElement;
  const request = new Strophe.Request(tree, () => undefined);
  request.getResponse = () => {
    const envelope = new Strophe.Builder('env', { type: 'mock' }).tree();
    envelope.appendChild(tree);
    return envelope;
  };
  connection._dataRecv(request);
}

/** Roster and disco answered; disco#info carries no `pubsub/pep` identity; PEP nodes do not exist. */
function answer(iq: Element): void {
  const { sizzle, Strophe } = mock.converse.env;
  const conn = mock.api.connection.get();
  if (!conn) return;
  const header = `id="${iq.getAttribute('id')}" from="${iq.getAttribute('to') ?? JID}" to="${conn.jid}" xmlns="jabber:client"`;
  if (sizzle(`query[xmlns="${Strophe.NS.ROSTER}"]`, iq).length) {
    inject(`<iq type="result" ${header}><query xmlns="${Strophe.NS.ROSTER}">
      <item jid="${JULIET}" name="Juliet" subscription="both"/></query></iq>`);
  } else if (sizzle(`query[xmlns="${Strophe.NS.DISCO_INFO}"]`, iq).length) {
    inject(`<iq type="result" ${header}><query xmlns="${Strophe.NS.DISCO_INFO}">
      <identity category="account" type="registered"/></query></iq>`);
  } else if (sizzle('pubsub', iq).length) {
    inject(`<iq type="error" ${header}><error type="cancel">
      <item-not-found xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></iq>`);
  }
}

describe('ConverseCryptoRepository on an account without PEP', () => {
  beforeAll(async () => {
    mock = (await import('@converse/headless')) as unknown as Mock;
    await serveHeadlessAssets();
    await repositories.xmpp.disconnect();
    const clear = mock.api.user.settings.clear.bind(mock.api.user.settings);
    mock.api.user.settings.clear = () => clear().catch(() => undefined);
    mock.converse.env.Strophe.Bosh.prototype._onClose = () => undefined;
    responder = setInterval(() => {
      for (const iq of mock.api.connection.get()?.IQ_stanzas ?? []) {
        if (answered.has(iq)) continue;
        answered.add(iq);
        answer(iq);
      }
    }, 10);
    await repositories.xmpp.connect({ jid: JID, password: 'secret', websocketUrl: '' });
  }, 20_000);

  afterAll(async () => {
    // Signing out while the first bundle is still being generated crashes the worker (§11).
    await mock.api.waitUntil('OMEMOInitialized');
    clearInterval(responder);
    await repositories.xmpp.disconnect();
  }, 20_000);

  it('reports encryption unavailable at once instead of stalling', async () => {
    // The account's disco runs right after sign-in: give it a moment, never the 30 s of the stall.
    const deadline = Date.now() + 5_000;
    let error: unknown;
    while (Date.now() < deadline && !(error instanceof DomainError)) {
      error = await repositories.crypto.devices(JULIET).then(
        () => undefined,
        (e: unknown) => e,
      );
      if (!error) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(error).toMatchObject({ code: 'EncryptionUnavailable' });
    const started = Date.now();
    expect(await repositories.crypto.available(JULIET)).toBe(false);
    await expect(repositories.crypto.ownDevices()).rejects.toMatchObject({
      code: 'EncryptionUnavailable',
    });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
