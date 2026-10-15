// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Chat, Device } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { type BobClient, connectBob, isPresenceFrom } from './test-support/bobClient';
import { restoreNodeEvent, serveHeadlessAssets } from './test-support/realSocket';

/**
 * OMEMO (XEP-0384) against the local Prosody (tools/xmpp-server, PEP on): alice runs the real
 * engine, which generates and publishes her bundle; bob cannot do OMEMO, so he publishes a device
 * list and bundles by hand with static, valid-looking keys. Converse only needs the identity key to
 * compute a fingerprint: no session is ever built. Skipped unless `XMPP_TEST_SERVER` is set; the
 * cases run in order and share one engine. Findings: wiki/development/converse.md §14.
 */

const SERVER = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
  ?.env.XMPP_TEST_SERVER;
const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
const TIMEOUT = 20_000;
const RUN = Date.now().toString(36);

const NS_OMEMO = 'eu.siacs.conversations.axolotl';
const DEVICELIST_NODE = `${NS_OMEMO}.devicelist`;
const bundleNode = (deviceId: number) => `${NS_OMEMO}.bundles:${deviceId}`;
/** Two of bob's devices: a legacy identity key is 33 bytes, `0x05` then the 32 displayed ones. */
const FIRST = { id: 424_242, keyStart: 1 };
const SECOND = { id: 434_343, keyStart: 101 };

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  connectTimeoutMs: 8_000,
});
const chats: Chat[] = [];
const changes: Array<{ jid: string; devices: Device[] }> = [];
repositories.chat.onChatChange((chat) => chats.push(chat));
repositories.crypto.onDevicesChange((jid, devices) => changes.push({ jid, devices }));

let bob: BobClient;
let iqCount = 0;

async function until<T>(condition: () => T | undefined | false, what: string): Promise<T> {
  const deadline = Date.now() + TIMEOUT - 1_000;
  while (Date.now() < deadline) {
    const value = condition();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

function bytes(start: number, length: number, prefix?: number): string {
  const raw = new Uint8Array(length);
  raw.forEach((_, i) => {
    raw[i] = (start + i) & 0xff;
  });
  const all = prefix === undefined ? raw : new Uint8Array([prefix, ...raw]);
  return btoa(String.fromCharCode(...all));
}

/** What Converse shows for a 33-byte legacy key: the hex of its last 32 bytes. */
function fingerprintOf(keyStart: number): string {
  return Array.from({ length: 32 }, (_, i) =>
    ((keyStart + i) & 0xff).toString(16).padStart(2, '0'),
  ).join('');
}

/** Bob's IQ to his own PEP service; resolves with the result (or error) stanza. */
function bobIq(payload: string, timeoutMs?: number): Promise<Element> {
  const id = `omemo-${RUN}-${++iqCount}`;
  bob.send(`<iq type="set" id="${id}">${payload}</iq>`);
  return bob.waitFor((s) => s.localName === 'iq' && s.getAttribute('id') === id, timeoutMs);
}

/** Open access: alice must read the nodes even before the presence subscription is in place. */
const OPEN_ACCESS = `<publish-options><x xmlns="jabber:x:data" type="submit">
  <field var="FORM_TYPE" type="hidden"><value>http://jabber.org/protocol/pubsub#publish-options</value></field>
  <field var="pubsub#access_model"><value>open</value></field></x></publish-options>`;

async function bobPublishesDeviceList(ids: number[]): Promise<void> {
  const result = await bobIq(`<pubsub xmlns="http://jabber.org/protocol/pubsub">
    <publish node="${DEVICELIST_NODE}"><item id="current"><list xmlns="${NS_OMEMO}">
      ${ids.map((id) => `<device id="${id}"/>`).join('')}</list></item></publish>${OPEN_ACCESS}</pubsub>`);
  expect(result.getAttribute('type')).toBe('result');
}

async function bobPublishesBundle(device: { id: number; keyStart: number }): Promise<void> {
  const result = await bobIq(`<pubsub xmlns="http://jabber.org/protocol/pubsub">
    <publish node="${bundleNode(device.id)}"><item id="current"><bundle xmlns="${NS_OMEMO}">
      <signedPreKeyPublic signedPreKeyId="1">${bytes(200, 32, 5)}</signedPreKeyPublic>
      <signedPreKeySignature>${bytes(50, 64)}</signedPreKeySignature>
      <identityKey>${bytes(device.keyStart, 32, 5)}</identityKey>
      <prekeys><preKeyPublic preKeyId="1">${bytes(150, 32, 5)}</preKeyPublic></prekeys>
    </bundle></item></publish>${OPEN_ACCESS}</pubsub>`);
  expect(result.getAttribute('type')).toBe('result');
}

/** Leaves the server as it was; a node that does not exist answers with an error, which is fine. */
function bobDeletesNode(node: string): Promise<Element> {
  return bobIq(
    `<pubsub xmlns="http://jabber.org/protocol/pubsub#owner"><delete node="${node}"/></pubsub>`,
    3_000,
  );
}

function bobRemovesAlice(): Promise<Element> {
  return bobIq(
    `<query xmlns="jabber:iq:roster"><item jid="${ALICE}" subscription="remove"/></query>`,
  );
}

const connectAlice = () =>
  repositories.xmpp.connect({ jid: ALICE, password: 'alice-pw', websocketUrl: SERVER ?? '' });

const bobDevices = () => repositories.crypto.devices(BOB);

describe.skipIf(!SERVER)('Converse OMEMO repository against the XMPP test server', () => {
  beforeAll(async () => {
    await restoreNodeEvent();
    await serveHeadlessAssets();
    bob = await connectBob({ url: SERVER ?? '', jid: BOB, password: 'bob-pw', resource: 'omemo' });
    await bobRemovesAlice();
    for (const node of [DEVICELIST_NODE, bundleNode(FIRST.id), bundleNode(SECOND.id)]) {
      await bobDeletesNode(node);
    }
  }, TIMEOUT);

  afterAll(async () => {
    for (const node of [DEVICELIST_NODE, bundleNode(FIRST.id), bundleNode(SECOND.id)]) {
      await bobDeletesNode(node).catch(() => undefined);
    }
    await bobRemovesAlice().catch(() => undefined);
    // jsdom's WebSocket sometimes never fires `close` (the Event mismatch of realSocket.ts).
    await Promise.race([bob.close(), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    await repositories.xmpp.disconnect().catch(() => undefined);
  }, TIMEOUT * 2);

  it(
    '1. lists this device among our own, then removes the ones left by earlier runs',
    async () => {
      await connectAlice();
      const ownId = await repositories.crypto.ownDeviceId();
      expect(ownId).toBeGreaterThan(0);
      const own = await repositories.crypto.ownDevices();
      const current = own.find((d) => d.deviceId === ownId);
      expect(current).toMatchObject({ jid: ALICE, trust: 'untrusted', isOwn: true });
      expect(current?.fingerprint).toMatch(/^[0-9a-f]{64}$/);

      await expect(repositories.crypto.removeOwnDevice(ownId)).rejects.toMatchObject({
        code: 'Unknown',
      });
      await expect(repositories.crypto.removeOwnDevice(1)).rejects.toMatchObject({
        code: 'DeviceNotFound',
      });
      // The server keeps alice's list between runs, and every run is a new device. A device that
      // comes back is live: another alice client (the author's app) re-publishes itself as soon
      // as we drop it. The exact published list is asserted in crypto.test.ts.
      const others = own.filter((d) => d.deviceId !== ownId).map((d) => d.deviceId);
      for (const deviceId of others) await repositories.crypto.removeOwnDevice(deviceId);
      const after = (await repositories.crypto.ownDevices()).map((d) => d.deviceId);
      expect(after).toContain(ownId);
      expect(after.length).toBeLessThanOrEqual(own.length);
      const live = after.filter((id) => id !== ownId);
      if (live.length > 0) console.warn('omemo contract: other alice devices online', live);
    },
    TIMEOUT,
  );

  it(
    "2. reads bob's published device with its fingerprint, blindly trusted",
    async () => {
      if ((await repositories.roster.list()).some((c) => c.jid === BOB)) {
        await repositories.roster.remove(BOB);
      }
      bob.forget();
      await repositories.roster.add(BOB, 'Bob');
      await bob.waitFor(isPresenceFrom(ALICE, 'subscribe'));
      bob.send(`<presence to="${ALICE}" type="subscribed"/>`);
      bob.send(`<presence to="${ALICE}" type="subscribe"/>`);
      let listed = await repositories.roster.list();
      await until(() => {
        void repositories.roster.list().then((l) => (listed = l));
        return listed.some((c) => c.jid === BOB && c.subscription === 'both');
      }, 'subscription both');

      await bobPublishesBundle(FIRST);
      await bobPublishesDeviceList([FIRST.id]);
      let devices = await bobDevices();
      await until(() => {
        void bobDevices().then((d) => (devices = d));
        return devices.length > 0;
      }, "bob's device list");
      expect(devices).toEqual([
        {
          jid: BOB,
          deviceId: FIRST.id,
          fingerprint: fingerprintOf(FIRST.keyStart),
          trust: 'untrusted',
          isOwn: false,
        },
      ]);
      expect(await repositories.crypto.available(BOB)).toBe(true);
      expect(await repositories.crypto.available(`nobody-${RUN}@localhost`)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '3. keeps a verification across sign-out and sign-in, and rejects unknown devices',
    async () => {
      await repositories.crypto.setTrust(BOB, FIRST.id, 'verified');
      expect((await bobDevices())[0]?.trust).toBe('verified');
      await expect(repositories.crypto.setTrust(BOB, 999, 'blocked')).rejects.toMatchObject({
        code: 'DeviceNotFound',
      });

      await repositories.xmpp.disconnect();
      await connectAlice();
      expect((await bobDevices())[0]).toMatchObject({ deviceId: FIRST.id, trust: 'verified' });
    },
    TIMEOUT,
  );

  it(
    '4. no longer trusts a new device blindly once one is verified, until the user decides',
    async () => {
      changes.splice(0);
      await bobPublishesBundle(SECOND);
      await bobPublishesDeviceList([FIRST.id, SECOND.id]);
      // The list arrives as a PEP push (alice advertises `+notify`), which the repository reports.
      const change = await until(
        () => changes.find((c) => c.jid === BOB && c.devices.some((d) => d.deviceId === SECOND.id)),
        'onDevicesChange with the new device',
      );
      expect(change.devices.find((d) => d.deviceId === SECOND.id)).toMatchObject({
        trust: 'blocked',
        fingerprint: fingerprintOf(SECOND.keyStart),
      });
      expect(change.devices.find((d) => d.deviceId === FIRST.id)?.trust).toBe('verified');

      await repositories.crypto.setTrust(BOB, SECOND.id, 'untrusted');
      const devices = await bobDevices();
      expect(devices.map((d) => [d.deviceId, d.trust])).toEqual([
        [FIRST.id, 'verified'],
        [SECOND.id, 'untrusted'],
      ]);
    },
    TIMEOUT,
  );

  it(
    '5. turns encryption on and off for a chat, which the chat repository reports',
    async () => {
      await repositories.chat.open(BOB);
      chats.splice(0);
      await repositories.crypto.setEncryption(BOB, true);
      await until(() => chats.some((c) => c.id === BOB && c.encrypted), 'encrypted chat');
      expect((await repositories.chat.list()).find((c) => c.id === BOB)?.encrypted).toBe(true);
      await repositories.crypto.setEncryption(BOB, false);
      await until(() => chats.some((c) => c.id === BOB && !c.encrypted), 'chat in clear');

      // With every device blocked the contact cannot be reached; unblocking one is enough.
      await repositories.crypto.setTrust(BOB, FIRST.id, 'blocked');
      await repositories.crypto.setTrust(BOB, SECOND.id, 'blocked');
      expect(await repositories.crypto.available(BOB)).toBe(false);
      await repositories.crypto.setTrust(BOB, FIRST.id, 'verified');
      expect(await repositories.crypto.available(BOB)).toBe(true);
    },
    TIMEOUT,
  );
});
