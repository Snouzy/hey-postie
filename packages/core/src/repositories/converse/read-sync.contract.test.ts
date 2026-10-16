// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Chat, Message } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { type BobClient, connectBob, isChatMessageFrom } from './test-support/bobClient';
import { prepareContractEnvironment, until } from './test-support/contractEnv';

/**
 * XEP-0490 read sync against the real test server (spec 2026-10-16-read-sync-and-search §1).
 * Converse is one instance per process, so alice's two devices are the app (the repositories) and
 * her "phone", a second session of hers written by hand (`connectBob` signed in as alice), which
 * publishes and reads the PEP node the way Conversations would. Bob writes. Skipped unless
 * `XMPP_TEST_SERVER` is set.
 */

const { SERVER, TIMEOUT } = await prepareContractEnvironment();
const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
const RUN = Date.now().toString(36);
const HALL = `sync-${RUN}@rooms.localhost`;
const MDS = 'urn:xmpp:mds:displayed:0';
const PUBSUB = 'http://jabber.org/protocol/pubsub';

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  priority: 10,
  connectTimeoutMs: 8_000,
  joinTimeoutMs: 8_000,
});
const chats: Chat[] = [];
const letters: Message[] = [];
repositories.chat.onChatChange((chat) => chats.push(chat));
repositories.chat.onMessage((message) => letters.push(message));

let bob: BobClient;
let phone: BobClient;

/** The stanza id the archive `by` stamped on a received stanza. */
function stanzaIdOf(stanza: Element, by: string): string {
  const stamp = Array.from(stanza.getElementsByTagNameNS('urn:xmpp:sid:0', 'stanza-id')).find(
    (element) => element.getAttribute('by') === by,
  );
  const id = stamp?.getAttribute('id');
  if (!id) throw new Error(`no stanza id by ${by}`);
  return id;
}

async function iq(client: BobClient, xml: string, id: string): Promise<Element> {
  client.send(xml);
  const answer = await client.waitFor((s) => s.localName === 'iq' && s.getAttribute('id') === id);
  if (answer.getAttribute('type') !== 'result') throw new Error(`iq ${id}: ${answer.outerHTML}`);
  return answer;
}

/** The phone marks a chat read, with the publish options of XEP-0490 §4. */
function phonePublishes(chatJid: string, stanzaId: string, by: string): Promise<Element> {
  const id = `pub-${chatJid}-${stanzaId}`;
  const field = (name: string, value: string) =>
    `<field var="pubsub#${name}"><value>${value}</value></field>`;
  return iq(
    phone,
    `<iq type="set" id="${id}"><pubsub xmlns="${PUBSUB}"><publish node="${MDS}"><item id="${chatJid}"><displayed xmlns="${MDS}"><stanza-id xmlns="urn:xmpp:sid:0" id="${stanzaId}" by="${by}"/></displayed></item></publish><publish-options><x xmlns="jabber:x:data" type="submit"><field var="FORM_TYPE" type="hidden"><value>${PUBSUB}#publish-options</value></field>${field('persist_items', 'true')}${field('max_items', 'max')}${field('send_last_published_item', 'never')}${field('access_model', 'whitelist')}</x></publish-options></pubsub></iq>`,
    id,
  );
}

let reads = 0;

/** The stanza id the node holds for a chat, read by the phone. */
async function phoneReads(chatJid: string): Promise<string | null> {
  reads += 1;
  const id = `items-${reads}`;
  const answer = await iq(
    phone,
    `<iq type="get" id="${id}"><pubsub xmlns="${PUBSUB}"><items node="${MDS}"><item id="${chatJid}"/></items></pubsub></iq>`,
    id,
  );
  return answer.getElementsByTagName('stanza-id')[0]?.getAttribute('id') ?? null;
}

const unreadOf = (chatId: string) => chats.filter((chat) => chat.id === chatId).at(-1)?.unreadCount;

describe.skipIf(!SERVER)('read sync (XEP-0490) against the XMPP test server', () => {
  beforeAll(async () => {
    bob = await connectBob({ url: SERVER ?? '', jid: BOB, password: 'bob-pw' });
    phone = await connectBob({
      url: SERVER ?? '',
      jid: ALICE,
      password: 'alice-pw',
      resource: `phone-${RUN}`,
    });
    await repositories.xmpp.connect({
      jid: ALICE,
      password: 'alice-pw',
      websocketUrl: SERVER ?? '',
    });
    // Converse handles messages only after `presencesInitialized`, a while after `connect`
    // resolves: bob writes until the app hears him (those letters only add to the unread count).
    for (let attempt = 0; !letters.some((m) => m.chatId === BOB) && attempt < 20; attempt += 1) {
      bob.send(
        `<message to="${ALICE}" type="chat" id="w${attempt}-${RUN}"><body>warm-up ${RUN}</body></message>`,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }, TIMEOUT * 2);

  afterAll(async () => {
    bob.leaveRoom(HALL, 'bob');
    await repositories.room.setBookmarked(HALL, false).catch(() => undefined);
    await Promise.race([
      Promise.all([bob.close(), phone.close()]),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    await repositories.xmpp.disconnect().catch(() => undefined);
  }, TIMEOUT);

  it(
    'the phone reads bob’s letter: the app’s unread count drops to 0',
    async () => {
      bob.send(
        `<message to="${ALICE}" type="chat" id="a-${RUN}"><body>one ${RUN}</body></message>`,
      );
      const received = await phone.waitFor(
        (s) => isChatMessageFrom(BOB)(s) && s.textContent?.includes(`one ${RUN}`) === true,
      );
      await until(() => letters.some((m) => m.body === `one ${RUN}`), 'the app receiving it');
      expect(unreadOf(BOB)).toBeGreaterThan(0);
      await phonePublishes(BOB, stanzaIdOf(received, ALICE), ALICE);
      await until(() => unreadOf(BOB) === 0, 'the app clearing the chat');
    },
    TIMEOUT * 2,
  );

  it(
    'the app reads bob’s next letter: the node names it for the phone',
    async () => {
      bob.send(
        `<message to="${ALICE}" type="chat" id="b-${RUN}"><body>two ${RUN}</body></message>`,
      );
      const received = await phone.waitFor(
        (s) => isChatMessageFrom(BOB)(s) && s.textContent?.includes(`two ${RUN}`) === true,
      );
      await until(() => unreadOf(BOB) === 1, 'the app counting the letter as unread');
      await repositories.chat.markRead(BOB);
      const expected = stanzaIdOf(received, ALICE);
      // The publish leaves after `markRead` resolves: the phone asks until the item is there.
      let published: string | null = null;
      for (const deadline = Date.now() + TIMEOUT; Date.now() < deadline; ) {
        published = await phoneReads(BOB).catch(() => null);
        if (published === expected) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(published).toBe(expected);
    },
    TIMEOUT * 2,
  );

  it(
    'in a hall: the phone reads bob’s letter, the app’s unread count drops to 0',
    async () => {
      await bob.joinRoom(HALL, 'bob');
      await repositories.room.join({ jid: HALL, nick: 'alice' });
      bob.forget();
      bob.send(
        `<message to="${HALL}" type="groupchat" id="h-${RUN}"><body>hall ${RUN}</body></message>`,
      );
      const echo = await bob.waitFor(
        (s) =>
          s.getAttribute('type') === 'groupchat' && s.textContent?.includes(`hall ${RUN}`) === true,
      );
      await until(() => unreadOf(HALL) === 1, 'the app counting the hall letter as unread');
      await phonePublishes(HALL, stanzaIdOf(echo, HALL), HALL);
      await until(() => unreadOf(HALL) === 0, 'the app clearing the hall');
    },
    TIMEOUT * 2,
  );
});
