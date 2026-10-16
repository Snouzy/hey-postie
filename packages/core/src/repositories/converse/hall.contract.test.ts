// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatState, Contact, ContactRequest, Message } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { type BobClient, connectBob, isPresenceFrom } from './test-support/bobClient';
import { prepareContractEnvironment, until } from './test-support/contractEnv';

/**
 * Subscription requests, the blocklist, presence and chat states against the local Prosody
 * (converse.md §17): alice is the repositories, bob the hand-written client. Same preamble and
 * conventions as `contract.test.ts`; the cases run in order.
 */

const { SERVER, TIMEOUT } = await prepareContractEnvironment();
const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
const RUN = Date.now().toString(36);
const CHATSTATES = 'http://jabber.org/protocol/chatstates';

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  priority: 10,
  connectTimeoutMs: 8_000,
});
const contacts: Contact[] = [];
const requests: ContactRequest[] = [];
const received: Message[] = [];
const states: Array<[string, string, ChatState]> = [];
const blocklists: string[][] = [];
repositories.roster.onChange((contact) => contacts.push(contact));
repositories.roster.onRequest((request) => requests.push(request));
repositories.roster.onBlockedChange((jids) => blocklists.push(jids));
repositories.chat.onMessage((message) => received.push(message));
repositories.chat.onChatState((chatId, fromJid, state) => states.push([chatId, fromJid, state]));

let bob: BobClient;

function bobIq(xml: string, id: string): Promise<Element> {
  bob.send(xml);
  return bob.waitFor((s) => s.localName === 'iq' && s.getAttribute('id') === id);
}

/** Bob drops alice from his roster, which also cancels both subscriptions on the server. */
function bobRemovesAlice(): Promise<Element> {
  return bobIq(
    `<iq type="set" id="remove-alice"><query xmlns="jabber:iq:roster"><item jid="${ALICE}" subscription="remove"/></query></iq>`,
    'remove-alice',
  );
}

describe.skipIf(!SERVER)('Requests, blocklist, presence and chat states against the server', () => {
  beforeAll(async () => {
    bob = await connectBob({ url: SERVER ?? '', jid: BOB, password: 'bob-pw' });
    // Prosody only delivers `subscribed` and roster pushes to resources that asked for the roster
    // ("interested resources", RFC 6121 §2.1.4; `send_to_interested_resources` in mod_presence).
    await bobIq('<iq type="get" id="roster-1"><query xmlns="jabber:iq:roster"/></iq>', 'roster-1');
    await bobRemovesAlice();
    await repositories.xmpp.connect({
      jid: ALICE,
      password: 'alice-pw',
      websocketUrl: SERVER ?? '',
    });
    // A clean slate on alice's side too: no bob in the roster, no bob on the blocklist.
    if ((await repositories.roster.list()).some((c) => c.jid === BOB)) {
      await repositories.roster.remove(BOB);
    }
    for (const request of await repositories.roster.requests()) {
      await repositories.roster.decline(request.jid);
    }
    await repositories.roster.unblock(BOB);
  }, TIMEOUT * 2);

  afterAll(async () => {
    await repositories.roster.unblock(BOB).catch(() => undefined);
    await bobRemovesAlice().catch(() => undefined);
    await Promise.race([bob.close(), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    await repositories.xmpp.disconnect().catch(() => undefined);
  }, TIMEOUT);

  it(
    '1. bob asks, alice sees the request with his sentence, accepts, both end up subscribed',
    async () => {
      bob.send(
        `<presence to="${ALICE}" type="subscribe"><status>It is me, Bob</status></presence>`,
      );
      const request = await until(() => requests.find((r) => r.jid === BOB), 'roster.onRequest');
      expect(request).toEqual({ jid: BOB, name: 'bob', message: 'It is me, Bob' });
      expect(await repositories.roster.requests()).toEqual([request]);
      expect((await repositories.roster.list()).map((c) => c.jid)).not.toContain(BOB);

      bob.forget();
      const accepted = await repositories.roster.accept(BOB);
      expect(accepted).toMatchObject({ jid: BOB, subscription: 'from' });
      await bob.waitFor(isPresenceFrom(ALICE, 'subscribed'));
      await bob.waitFor(isPresenceFrom(ALICE, 'subscribe'));
      bob.send(`<presence to="${ALICE}" type="subscribed"/>`);
      await until(
        () => contacts.some((c) => c.jid === BOB && c.subscription === 'both'),
        'subscription both',
      );
      expect(await repositories.roster.requests()).toEqual([]);
      expect((await repositories.roster.list()).find((c) => c.jid === BOB)).toMatchObject({
        subscription: 'both',
      });
    },
    TIMEOUT * 2,
  );

  it(
    '2. alice sets away with a sentence, bob sees it; online again drops the show',
    async () => {
      bob.forget();
      await repositories.xmpp.setPresence({ show: 'away', status: `lunch ${RUN}` });
      const away = await bob.waitFor(
        (s) => isPresenceFrom(ALICE, null)(s) && s.querySelector('show')?.textContent === 'away',
      );
      expect(away.querySelector('status')?.textContent).toBe(`lunch ${RUN}`);

      bob.forget();
      await repositories.xmpp.setPresence({ show: 'online' });
      const online = await bob.waitFor(
        (s) => isPresenceFrom(ALICE, null)(s) && !s.querySelector('show'),
      );
      expect(online.querySelector('status')).toBeNull();
    },
    TIMEOUT,
  );

  it(
    '3. bob composes, alice sees composing then paused',
    async () => {
      await repositories.chat.open(BOB);
      const before = states.length;
      bob.send(`<message to="${ALICE}" type="chat"><composing xmlns="${CHATSTATES}"/></message>`);
      await until(() => states.slice(before).some((s) => s[2] === 'composing'), 'composing');
      expect(states.at(-1)).toEqual([BOB, BOB, 'composing']);
      bob.send(`<message to="${ALICE}" type="chat"><paused xmlns="${CHATSTATES}"/></message>`);
      await until(() => states.at(-1)?.[2] === 'paused', 'paused');

      bob.forget();
      await repositories.chat.setComposing(BOB, true);
      const stanza = await bob.waitFor(
        (s) =>
          s.localName === 'message' &&
          (s.getAttribute('from') ?? '').startsWith(ALICE) &&
          s.getElementsByTagNameNS(CHATSTATES, 'composing').length > 0,
      );
      expect(stanza.getElementsByTagName('body')).toHaveLength(0);
    },
    TIMEOUT,
  );

  it(
    '4. alice blocks bob: he is on the list, his message does not arrive; unblocked, it does',
    async () => {
      const before = blocklists.length;
      await repositories.roster.block(BOB);
      expect((await repositories.roster.list()).find((c) => c.jid === BOB)).toMatchObject({
        subscription: 'both',
      });
      expect(await repositories.roster.blocked()).toContain(BOB);
      await until(() => blocklists.slice(before).some((l) => l.includes(BOB)), 'onBlockedChange');
      bob.send(
        `<message to="${ALICE}" type="chat" id="${RUN}-blocked"><body>blocked ${RUN}</body></message>`,
      );
      // Prosody's mod_blocklist drops a blocked sender's message silently (`bounce_blocked_messages`
      // is off by default). The server handles a session's stanzas in order: once the ping is
      // answered, the message has been dealt with.
      await bobIq(
        '<iq type="get" id="sync-blocked" to="localhost"><ping xmlns="urn:xmpp:ping"/></iq>',
        'sync-blocked',
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(received.some((m) => m.body === `blocked ${RUN}`)).toBe(false);

      await repositories.roster.unblock(BOB);
      expect(await repositories.roster.blocked()).not.toContain(BOB);
      await until(
        () => blocklists.length > before && !blocklists.at(-1)?.includes(BOB),
        'onBlockedChange after unblock',
      );
      bob.send(
        `<message to="${ALICE}" type="chat" id="${RUN}-after"><body>after ${RUN}</body></message>`,
      );
      await until(() => received.some((m) => m.body === `after ${RUN}`), 'message after unblock');
    },
    TIMEOUT * 2,
  );
});
