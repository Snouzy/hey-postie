// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Chat, Device } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { serveHeadlessAssets } from './test-support/realSocket';

/**
 * The OMEMO repository over Converse's `MockConnection` (wiki/development/converse.md §11): the
 * real engine generates a real bundle (libomemo's wasm served from the package), while every IQ
 * it sends (roster, disco, PEP device lists and bundles for both OMEMO versions, publishes, pings)
 * is answered by a scripted responder below, which also echoes our own publishes as PEP events the
 * way a server does. Device list and bundle pushes are injected as PEP events. One Converse
 * instance per file; the cases run in order.
 */

interface Mock {
  api: {
    connection: { get(): MockConnection | undefined };
    user: { settings: { clear(): Promise<unknown> } };
  };
  _converse: {
    state: {
      devicelists_v2: {
        get(jid: string): { devices: { get(id: string): { save(a: object): void } | undefined } };
      };
    };
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
const NS_OMEMO2 = 'urn:xmpp:omemo:2';
const PUBSUB = 'http://jabber.org/protocol/pubsub';
/** Devices of our own left on the server by other clients; and juliet's two. */
const STALE = 31_337;
const OTHER_OWN = 4_000;
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
/** What the scripted server holds, per version: `jid` → device ids, `jid:deviceId` → key start. */
const deviceLists = new Map<string, number[]>([[JID, [STALE]]]);
const bundles = new Map<string, number>();
const deviceListsV2 = new Map<string, number[]>();
const bundlesV2 = new Map<string, number>();
/** Ids the next echo of our own list adds back once (another client re-publishing). */
let echoExtra: number[] = [];
let failPublishes = false;

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

/** A legacy identity key is 33 bytes (`0x05` + 32 displayed); an omemo:2 one the 32 bytes. */
function bundleXml(keyStart: number): string {
  return `<bundle xmlns="${NS_OMEMO}">
    <signedPreKeyPublic signedPreKeyId="1">${bytes(200, 32, 5)}</signedPreKeyPublic>
    <signedPreKeySignature>${bytes(50, 64)}</signedPreKeySignature>
    <identityKey>${bytes(keyStart, 32, 5)}</identityKey>
    <prekeys><preKeyPublic preKeyId="1">${bytes(150, 32, 5)}</preKeyPublic></prekeys></bundle>`;
}

function bundleV2Xml(keyStart: number): string {
  return `<bundle xmlns="${NS_OMEMO2}"><spk id="1">${bytes(200, 32)}</spk><spks>${bytes(50, 64)}</spks>
    <ik>${bytes(keyStart, 32)}</ik><prekeys><pk id="1">${bytes(150, 32)}</pk></prekeys></bundle>`;
}

const listXml = (ids: number[]) =>
  `<list xmlns="${NS_OMEMO}">${ids.map((d) => `<device id="${d}"/>`).join('')}</list>`;
const listV2Xml = (ids: number[]) =>
  `<devices xmlns="${NS_OMEMO2}">${ids.map((d) => `<device id="${d}"/>`).join('')}</devices>`;

function pepEvent(from: string, node: string, itemId: string, inner: string): void {
  const conn = mock.api.connection.get();
  inject(`<message from="${from}" to="${conn?.jid}" xmlns="jabber:client"><event xmlns="${PUBSUB}#event">
    <items node="${node}"><item id="${itemId}">${inner}</item></items></event></message>`);
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
  const error = (condition: string) =>
    inject(`<iq type="error" ${header}><error type="cancel">
      <${condition} xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></iq>`);
  const pubsubItems = (node: string, itemId: string, inner: string) =>
    result(
      `<pubsub xmlns="${PUBSUB}"><items node="${node}"><item id="${itemId}">${inner}</item></items></pubsub>`,
    );

  const publish = sizzle(`pubsub[xmlns="${PUBSUB}"] > publish`, iq)[0];
  const items = sizzle(`pubsub[xmlns="${PUBSUB}"] > items`, iq)[0];
  const node = (publish ?? items)?.getAttribute('node') ?? '';
  const deviceId = node.split(':').pop() ?? '';
  if (publish) {
    if (failPublishes) {
      error('not-allowed');
    } else {
      result('');
      echoOwnPublish(node, publish);
    }
  } else if (iq.getAttribute('type') === 'set' || sizzle('ping', iq).length) {
    result('');
  } else if (sizzle(`query[xmlns="${Strophe.NS.ROSTER}"]`, iq).length) {
    result(
      `<query xmlns="${Strophe.NS.ROSTER}"><item jid="${JULIET}" name="Juliet" subscription="both"/></query>`,
    );
  } else if (sizzle(`query[xmlns="${Strophe.NS.DISCO_INFO}"]`, iq).length) {
    result(`<query xmlns="${Strophe.NS.DISCO_INFO}"><identity category="pubsub" type="pep"/>
      <feature var="${PUBSUB}"/><feature var="${PUBSUB}#publish-options"/></query>`);
  } else if (node === `${NS_OMEMO}.devicelist` && deviceLists.has(to)) {
    pubsubItems(node, 'current', listXml(deviceLists.get(to) ?? []));
  } else if (node === `${NS_OMEMO2}:devices` && deviceListsV2.has(to)) {
    pubsubItems(node, 'current', listV2Xml(deviceListsV2.get(to) ?? []));
  } else if (node.startsWith(`${NS_OMEMO}.bundles:`) && bundles.has(`${to}:${deviceId}`)) {
    pubsubItems(node, 'current', bundleXml(bundles.get(`${to}:${deviceId}`) ?? 0));
  } else if (node === `${NS_OMEMO2}:bundles`) {
    const requested = sizzle('item', items as Element)[0]?.getAttribute('id') ?? '';
    const keyStart = bundlesV2.get(`${to}:${requested}`);
    if (keyStart === undefined) error('item-not-found');
    else pubsubItems(node, requested, bundleV2Xml(keyStart));
  } else if (items) {
    error('item-not-found');
  }
}

/** A server echoes a PEP publish to the publisher's own `+notify` resources. */
function echoOwnPublish(node: string, publish: Element): void {
  const { sizzle } = mock.converse.env;
  const ids = sizzle('device', publish).map((d) => Number(d.getAttribute('id')));
  const extra = echoExtra;
  echoExtra = [];
  const all = [...ids, ...extra];
  if (node === `${NS_OMEMO}.devicelist`) {
    deviceLists.set(JID, all);
    pepEvent(JID, node, 'current', listXml(all));
  } else if (node === `${NS_OMEMO2}:devices`) {
    deviceListsV2.set(JID, all);
    pepEvent(JID, node, 'current', listV2Xml(all));
  }
}

/** Juliet's (or our other client's) PEP push of a legacy device list. */
function pushDeviceList(from: string, ids: number[]): void {
  deviceLists.set(from, ids);
  pepEvent(from, `${NS_OMEMO}.devicelist`, 'current', listXml(ids));
}

function pushBundle(from: string, deviceId: number, keyStart: number): void {
  bundles.set(`${from}:${deviceId}`, keyStart);
  pepEvent(from, `${NS_OMEMO}.bundles:${deviceId}`, 'current', bundleXml(keyStart));
}

const julietDevices = () => repositories.crypto.devices(JULIET);
const trustOf = (devices: Device[]) => devices.map((d) => [d.deviceId, d.trust]);
const waitUntil = <T>(condition: () => T) => mock.converse.env.u.waitUntil(condition);
/** The ids of the last legacy device list we published. */
function lastPublishedIds(): string[] {
  const { sizzle } = mock.converse.env;
  const published = mock.api.connection
    .get()
    ?.IQ_stanzas.filter((iq) => sizzle(`publish[node="${NS_OMEMO}.devicelist"]`, iq).length)
    .pop();
  return sizzle('device', published as Element).map((d) => d.getAttribute('id') ?? '');
}

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

  it('lists our own devices: this one trusted with its fingerprint, an unknown one excluded', async () => {
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
    // B1: a device claiming to be ours that this client never decided on is not encrypted to.
    expect(own.find((d) => d.deviceId === STALE)).toMatchObject({
      trust: 'blocked',
      fingerprint: '',
    });
  });

  it('removes a stale own device even when the echo of our list brings it back once', async () => {
    const ownId = await repositories.crypto.ownDeviceId();
    await expect(repositories.crypto.removeOwnDevice(ownId)).rejects.toMatchObject({
      code: 'Unknown',
    });
    await expect(repositories.crypto.removeOwnDevice(1)).rejects.toMatchObject({
      code: 'DeviceNotFound',
    });
    echoExtra = [STALE];
    await repositories.crypto.removeOwnDevice(STALE);
    expect((await repositories.crypto.ownDevices()).map((d) => d.deviceId)).toEqual([ownId]);
    expect(lastPublishedIds()).toEqual([String(ownId)]);
  });

  it('excludes a new own device pushed by the server until the user decides', async () => {
    const ownId = await repositories.crypto.ownDeviceId();
    changes.splice(0);
    pushDeviceList(JID, [ownId, OTHER_OWN]);
    const change = await waitUntil(() =>
      changes.find((c) => c.jid === JID && c.devices.some((d) => d.deviceId === OTHER_OWN)),
    );
    expect(change?.devices.find((d) => d.deviceId === OTHER_OWN)?.trust).toBe('blocked');
    expect(change?.devices.find((d) => d.deviceId === ownId)?.trust).toBe('untrusted');
  });

  it('surfaces a failed publish when removing an own device', async () => {
    failPublishes = true;
    await expect(repositories.crypto.removeOwnDevice(OTHER_OWN)).rejects.toMatchObject({
      code: 'Unknown',
    });
    // The device is still on the server, so it is still ours to remove.
    expect((await repositories.crypto.ownDevices()).map((d) => d.deviceId)).toContain(OTHER_OWN);
    failPublishes = false;
    await repositories.crypto.removeOwnDevice(OTHER_OWN);
    expect(lastPublishedIds()).toEqual([String(await repositories.crypto.ownDeviceId())]);
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
    const change = await waitUntil(() =>
      changes.find((c) => c.jid === JULIET && c.devices.some((d) => d.deviceId === SECOND.id)),
    );
    expect(change?.devices.find((d) => d.deviceId === SECOND.id)).toMatchObject({
      trust: 'blocked',
      fingerprint: fingerprintOf(SECOND.keyStart),
    });
    await repositories.crypto.setTrust(JULIET, SECOND.id, 'untrusted');
    expect(trustOf(await julietDevices())).toEqual([
      [FIRST.id, 'verified'],
      [SECOND.id, 'untrusted'],
    ]);
  });

  it('voids a verification when the device publishes another identity key', async () => {
    changes.splice(0);
    pushBundle(JULIET, FIRST.id, 55);
    const change = await waitUntil(() =>
      changes.find(
        (c) =>
          c.jid === JULIET &&
          c.devices.some((d) => d.deviceId === FIRST.id && d.fingerprint === fingerprintOf(55)),
      ),
    );
    expect(change?.devices.find((d) => d.deviceId === FIRST.id)?.trust).toBe('blocked');
    // The user compares the new fingerprint and verifies again.
    await repositories.crypto.setTrust(JULIET, FIRST.id, 'verified');
    expect((await julietDevices())[0]).toMatchObject({
      trust: 'verified',
      fingerprint: fingerprintOf(55),
    });
    pushBundle(JULIET, FIRST.id, 55);
    await waitUntil(() => changes.length > 1);
    expect((await julietDevices())[0]?.trust).toBe('verified');
  });

  it('merges the omemo:2 list by device id, the most restrictive state winning', async () => {
    deviceListsV2.set(JULIET, [SECOND.id]);
    bundlesV2.set(`${JULIET}:${SECOND.id}`, SECOND.keyStart);
    changes.splice(0);
    pepEvent(JULIET, `${NS_OMEMO2}:devices`, 'current', listV2Xml([SECOND.id]));
    await waitUntil(() => changes.some((c) => c.jid === JULIET));
    // Known from the legacy list: inherits its state instead of being treated as new.
    expect(trustOf(await julietDevices())).toEqual([
      [FIRST.id, 'verified'],
      [SECOND.id, 'untrusted'],
    ]);
    const v2Model = mock._converse.state.devicelists_v2.get(JULIET).devices.get(String(SECOND.id));
    v2Model?.save({ trusted: -1 });
    expect(trustOf(await julietDevices())).toEqual([
      [FIRST.id, 'verified'],
      [SECOND.id, 'blocked'],
    ]);
    await repositories.crypto.setTrust(JULIET, SECOND.id, 'untrusted');
    expect((await julietDevices())[1]?.trust).toBe('untrusted');
  });

  it('hides a device its owner dropped in one version, unavailable when every device is blocked', async () => {
    pushDeviceList(JULIET, [FIRST.id]);
    await waitUntil(() => changes.some((c) => c.jid === JULIET && c.devices.length === 1));
    expect((await julietDevices()).map((d) => d.deviceId)).toEqual([FIRST.id]);
    await repositories.crypto.setTrust(JULIET, FIRST.id, 'blocked');
    expect(await repositories.crypto.available(JULIET)).toBe(false);
    await repositories.crypto.setTrust(JULIET, FIRST.id, 'verified');
    expect(await repositories.crypto.available(JULIET)).toBe(true);
  });

  it('refuses to verify a device without a published key', async () => {
    pushDeviceList(JULIET, [FIRST.id, 779]);
    await waitUntil(() => changes.some((c) => c.devices.some((d) => d.deviceId === 779)));
    await expect(repositories.crypto.setTrust(JULIET, 779, 'verified')).rejects.toMatchObject({
      code: 'EncryptionUnavailable',
    });
  });

  it('turns encryption on for a chat, which the chat repository reports', async () => {
    await repositories.chat.open(JULIET);
    chats.splice(0);
    await repositories.crypto.setEncryption(JULIET, true);
    await waitUntil(() => chats.some((c) => c.id === JULIET && c.encrypted));
    expect((await repositories.chat.list()).find((c) => c.id === JULIET)?.encrypted).toBe(true);
    await expect(
      repositories.crypto.setEncryption('nobody@montague.lit', true),
    ).rejects.toMatchObject({ code: 'Unknown' });
  });

  it('answers at once, not after a timeout, once signed out', async () => {
    await repositories.xmpp.disconnect();
    const started = Date.now();
    expect(await repositories.crypto.available(JULIET)).toBe(false);
    await expect(julietDevices()).rejects.toMatchObject({ code: 'EncryptionUnavailable' });
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
