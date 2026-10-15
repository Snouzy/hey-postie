// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Chat, Device } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { serveHeadlessAssets } from './test-support/realSocket';

/**
 * The OMEMO repository over Converse's `MockConnection` (wiki/development/converse.md §11): the
 * real engine generates a real bundle (libomemo's wasm served from the package), while every IQ
 * it sends (roster, disco, PEP device lists and bundles, publishes) is answered by a scripted
 * responder below, and device list pushes are injected as PEP events. One Converse instance per
 * file; the cases run in order.
 */

interface Mock {
  api: {
    connection: { get(): MockConnection | undefined };
    user: { settings: { clear(): Promise<unknown> } };
  };
  converse: {
    env: {
      Strophe: {
        NS: Record<string, string>;
        Bosh: { prototype: { _onClose?: (event: { code: number; reason: string }) => void } };
        Request: new (stanza: Element, callback: () => void) => { getResponse(): Element };
        Builder: new (name: string, attrs: Record<string, string>) => { tree(): Element };
      };
      stx: (strings: TemplateStringsArray, ...values: unknown[]) => { tree(): Element };
      sizzle: (selector: string, element: Element) => Element[];
      u: { waitUntil<T>(condition: () => T): Promise<T> };
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
const NS_OMEMO = 'eu.siacs.conversations.axolotl';
const PUBSUB = 'http://jabber.org/protocol/pubsub';
/** A stale device of our own, left on the server by another client; and juliet's two. */
const STALE = 31_337;
const FIRST = { id: 777, keyStart: 1 };
const SECOND = { id: 778, keyStart: 101 };

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  mockConnection: true,
  connectTimeoutMs: 5_000,
});
const chats: Chat[] = [];
const changes: Array<{ jid: string; devices: Device[] }> = [];
repositories.chat.onChatChange((chat) => chats.push(chat));
repositories.crypto.onDevicesChange((jid, devices) => changes.push({ jid, devices }));

let mock: Mock;
let responder: ReturnType<typeof setInterval>;
const answered = new WeakSet<Element>();
/** What the scripted server holds: `jid` → device ids, and `jid:deviceId` → identity key start. */
const deviceLists = new Map<string, number[]>([[JID, [STALE]]]);
const bundles = new Map<string, number>();

function bytes(start: number, length: number, prefix?: number): string {
  const raw = Array.from({ length }, (_, i) => (start + i) & 0xff);
  return btoa(String.fromCharCode(...(prefix === undefined ? raw : [prefix, ...raw])));
}

function fingerprintOf(keyStart: number): string {
  return Array.from({ length: 32 }, (_, i) =>
    ((keyStart + i) & 0xff).toString(16).padStart(2, '0'),
  ).join('');
}

/** Feeds a stanza, written as XML, to the mock connection as if the server had sent it. */
function inject(xml: string): void {
  const { Strophe } = mock.converse.env;
  const connection = mock.api.connection.get();
  if (!connection) throw new Error('no connection');
  const tree = new DOMParser().parseFromString(xml, 'text/xml').documentElement;
  if (tree.localName === 'parsererror') throw new Error(`bad test stanza: ${xml}`);
  const request = new Strophe.Request(tree, () => undefined);
  request.getResponse = () => {
    const envelope = new Strophe.Builder('env', { type: 'mock' }).tree();
    envelope.appendChild(tree);
    return envelope;
  };
  connection._dataRecv(request);
}

function bundleXml(keyStart: number): string {
  return `<bundle xmlns="${NS_OMEMO}">
    <signedPreKeyPublic signedPreKeyId="1">${bytes(200, 32, 5)}</signedPreKeyPublic>
    <signedPreKeySignature>${bytes(50, 64)}</signedPreKeySignature>
    <identityKey>${bytes(keyStart, 32, 5)}</identityKey>
    <prekeys><preKeyPublic preKeyId="1">${bytes(150, 32, 5)}</preKeyPublic></prekeys></bundle>`;
}

/** The scripted server. Unknown `get`s stay unanswered (Converse times them out on its own). */
function answer(iq: Element): void {
  const { sizzle, Strophe } = mock.converse.env;
  const conn = mock.api.connection.get();
  if (!conn) return;
  const id = iq.getAttribute('id') ?? '';
  const to = iq.getAttribute('to') ?? JID;
  const header = `id="${id}" from="${to}" to="${conn.jid}" xmlns="jabber:client"`;
  const result = (inner: string) => inject(`<iq type="result" ${header}>${inner}</iq>`);
  const notFound = () =>
    inject(`<iq type="error" ${header}><error type="cancel">
      <item-not-found xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></iq>`);

  const items = sizzle(`pubsub[xmlns="${PUBSUB}"] > items`, iq)[0];
  const node = items?.getAttribute('node') ?? '';
  if (iq.getAttribute('type') === 'set' || sizzle('ping', iq).length) {
    result('');
  } else if (sizzle(`query[xmlns="${Strophe.NS.ROSTER}"]`, iq).length) {
    result(
      `<query xmlns="${Strophe.NS.ROSTER}"><item jid="${JULIET}" name="Juliet" subscription="both"/></query>`,
    );
  } else if (sizzle(`query[xmlns="${Strophe.NS.DISCO_INFO}"]`, iq).length) {
    result(`<query xmlns="${Strophe.NS.DISCO_INFO}"><identity category="pubsub" type="pep"/>
      <feature var="${PUBSUB}"/><feature var="${PUBSUB}#publish-options"/></query>`);
  } else if (node === `${NS_OMEMO}.devicelist` && deviceLists.has(to)) {
    const devices = (deviceLists.get(to) ?? []).map((d) => `<device id="${d}"/>`).join('');
    result(`<pubsub xmlns="${PUBSUB}"><items node="${node}"><item id="current">
      <list xmlns="${NS_OMEMO}">${devices}</list></item></items></pubsub>`);
  } else if (
    node.startsWith(`${NS_OMEMO}.bundles:`) &&
    bundles.has(`${to}:${node.split(':').pop()}`)
  ) {
    const keyStart = bundles.get(`${to}:${node.split(':').pop()}`) ?? 0;
    result(`<pubsub xmlns="${PUBSUB}"><items node="${node}"><item id="current">
      ${bundleXml(keyStart)}</item></items></pubsub>`);
  } else if (items) {
    notFound();
  }
}

/** Juliet's (or our other client's) PEP push of a device list. */
function pushDeviceList(from: string, ids: number[]): void {
  const conn = mock.api.connection.get();
  deviceLists.set(from, ids);
  const devices = ids.map((d) => `<device id="${d}"/>`).join('');
  inject(`<message from="${from}" to="${conn?.jid}" xmlns="jabber:client"><event xmlns="${PUBSUB}#event">
    <items node="${NS_OMEMO}.devicelist"><item id="current"><list xmlns="${NS_OMEMO}">${devices}</list>
    </item></items></event></message>`);
}

const julietDevices = () => repositories.crypto.devices(JULIET);

describe('ConverseCryptoRepository over the MockConnection', () => {
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
    bundles.set(`${JULIET}:${FIRST.id}`, FIRST.keyStart);
    deviceLists.set(JULIET, [FIRST.id]);
    await repositories.xmpp.connect({ jid: JID, password: 'secret', websocketUrl: '' });
  }, 20_000);

  afterAll(async () => {
    clearInterval(responder);
    await repositories.xmpp.disconnect();
  });

  it('lists our own devices, this one with its fingerprint, and removes a stale one', async () => {
    const ownId = await repositories.crypto.ownDeviceId();
    expect(ownId).toBeGreaterThan(0);
    const own = await repositories.crypto.ownDevices();
    expect(own.map((d) => d.deviceId).sort()).toEqual([ownId, STALE].sort());
    expect(own.find((d) => d.deviceId === ownId)).toMatchObject({
      jid: JID,
      trust: 'untrusted',
      isOwn: true,
    });
    expect(own.find((d) => d.deviceId === ownId)?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(own.find((d) => d.deviceId === STALE)?.fingerprint).toBe('');

    await expect(repositories.crypto.removeOwnDevice(ownId)).rejects.toMatchObject({
      code: 'Unknown',
    });
    await expect(repositories.crypto.removeOwnDevice(1)).rejects.toMatchObject({
      code: 'DeviceNotFound',
    });
    await repositories.crypto.removeOwnDevice(STALE);
    expect((await repositories.crypto.ownDevices()).map((d) => d.deviceId)).toEqual([ownId]);
    const published = mock.api.connection
      .get()
      ?.IQ_stanzas.filter(
        (iq) =>
          mock.converse.env.sizzle(`publish[node="${NS_OMEMO}.devicelist"] device`, iq).length,
      )
      .pop();
    expect(
      mock.converse.env.sizzle('device', published as Element).map((d) => d.getAttribute('id')),
    ).toEqual([String(ownId)]);
  });

  it("reads a contact's devices with their fingerprints, blindly trusted", async () => {
    expect(await julietDevices()).toEqual([
      {
        jid: JULIET,
        deviceId: FIRST.id,
        fingerprint: fingerprintOf(FIRST.keyStart),
        trust: 'untrusted',
        isOwn: false,
      },
    ]);
    expect(await repositories.crypto.available(JULIET)).toBe(true);
    expect(await repositories.crypto.available('nobody@montague.lit')).toBe(false);
  });

  it('writes trust and rejects unknown devices', async () => {
    await repositories.crypto.setTrust(JULIET, FIRST.id, 'verified');
    expect((await julietDevices())[0]?.trust).toBe('verified');
    await expect(repositories.crypto.setTrust(JULIET, 999, 'blocked')).rejects.toMatchObject({
      code: 'DeviceNotFound',
    });
  });

  it('excludes a new device of a contact with a verified one, until the user decides', async () => {
    changes.splice(0);
    bundles.set(`${JULIET}:${SECOND.id}`, SECOND.keyStart);
    pushDeviceList(JULIET, [FIRST.id, SECOND.id]);
    const change = await mock.converse.env.u.waitUntil(() =>
      changes.find((c) => c.jid === JULIET && c.devices.some((d) => d.deviceId === SECOND.id)),
    );
    expect(change?.devices.find((d) => d.deviceId === SECOND.id)).toMatchObject({
      trust: 'blocked',
      fingerprint: fingerprintOf(SECOND.keyStart),
    });
    await repositories.crypto.setTrust(JULIET, SECOND.id, 'untrusted');
    expect((await julietDevices()).map((d) => [d.deviceId, d.trust])).toEqual([
      [FIRST.id, 'verified'],
      [SECOND.id, 'untrusted'],
    ]);
  });

  it('hides a device its owner dropped, and is unavailable when every device is blocked', async () => {
    pushDeviceList(JULIET, [FIRST.id]);
    await mock.converse.env.u.waitUntil(() =>
      changes.some((c) => c.jid === JULIET && c.devices.length === 1),
    );
    expect((await julietDevices()).map((d) => d.deviceId)).toEqual([FIRST.id]);
    await repositories.crypto.setTrust(JULIET, FIRST.id, 'blocked');
    expect(await repositories.crypto.available(JULIET)).toBe(false);
    await repositories.crypto.setTrust(JULIET, FIRST.id, 'verified');
    expect(await repositories.crypto.available(JULIET)).toBe(true);
  });

  it('turns encryption on for a chat, which the chat repository reports', async () => {
    await repositories.chat.open(JULIET);
    chats.splice(0);
    await repositories.crypto.setEncryption(JULIET, true);
    await mock.converse.env.u.waitUntil(() => chats.some((c) => c.id === JULIET && c.encrypted));
    expect((await repositories.chat.list()).find((c) => c.id === JULIET)?.encrypted).toBe(true);
    await expect(
      repositories.crypto.setEncryption('nobody@montague.lit', true),
    ).rejects.toMatchObject({ code: 'Unknown' });
  });
});
