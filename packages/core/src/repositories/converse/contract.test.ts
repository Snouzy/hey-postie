// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '../../contracts/errors';
import type { AccountState, Chat, Contact, Message } from '../../contracts/types';
import { createConverseRepositories } from './index';
import {
  type BobClient,
  connectBob,
  isChatMessageFrom,
  isPresenceFrom,
} from './test-support/bobClient';
import { prepareContractEnvironment, until } from './test-support/contractEnv';

/**
 * Contract test against a real XMPP server (tools/xmpp-server): the repositories sign in as alice
 * over a real WebSocket, while bob is a hand-written client so that the two sides stay independent.
 * Skipped unless `XMPP_TEST_SERVER` is set; `pnpm test:contract` sets it. The cases run in order
 * and share one engine (one Converse instance per process). What they found is in
 * wiki/development/converse.md §12, "Contract test".
 */

const { SERVER, TIMEOUT } = await prepareContractEnvironment();
const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
/** The server archives every run: fixtures carry a run token so that they never match an old one. */
const RUN = Date.now().toString(36);

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  connectTimeoutMs: 8_000,
});
const states: AccountState[] = [];
const received: Message[] = [];
const updated: Message[] = [];
const chats: Chat[] = [];
const contacts: Contact[] = [];
repositories.xmpp.onStateChange((state) => states.push(state));
repositories.chat.onMessage((message) => received.push(message));
repositories.chat.onMessageUpdate((message) => updated.push(message));
repositories.chat.onChatChange((chat) => chats.push(chat));
repositories.roster.onChange((contact) => contacts.push(contact));

let bob: BobClient;

const connectAlice = (password = 'alice-pw') =>
  repositories.xmpp.connect({ jid: ALICE, password, websocketUrl: SERVER ?? '' });

/** Bob drops alice from his roster, which also cancels both subscriptions on the server. */
function bobRemovesAlice(): Promise<Element> {
  bob.send(
    `<iq type="set" id="remove-alice"><query xmlns="jabber:iq:roster"><item jid="${ALICE}" subscription="remove"/></query></iq>`,
  );
  return bob.waitFor((s) => s.localName === 'iq' && s.getAttribute('id') === 'remove-alice');
}

describe.skipIf(!SERVER)('Converse repositories against the XMPP test server', () => {
  beforeAll(async () => {
    bob = await connectBob({ url: SERVER ?? '', jid: BOB, password: 'bob-pw' });
    await bobRemovesAlice();
  }, TIMEOUT);

  afterAll(async () => {
    await bobRemovesAlice().catch(() => undefined);
    await bob.close();
    await repositories.xmpp.disconnect().catch(() => undefined);
  }, TIMEOUT);

  it(
    '1. rejects a wrong password with InvalidCredentials, then connects',
    async () => {
      const error = await connectAlice('wrong-pw').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('InvalidCredentials');
      expect(states).toEqual([]);

      await connectAlice();
      expect(states).toEqual(['online']);
    },
    TIMEOUT,
  );

  it(
    '2. adds bob to the roster, ends with a mutual subscription and sees his presence',
    async () => {
      // The server keeps the roster between runs: start from a clean slate on both sides.
      if ((await repositories.roster.list()).some((c) => c.jid === BOB)) {
        await repositories.roster.remove(BOB);
      }
      bob.forget();
      const added = await repositories.roster.add(BOB, 'Bob');
      expect(added).toMatchObject({ jid: BOB, name: 'Bob' });

      await bob.waitFor(isPresenceFrom(ALICE, 'subscribe'));
      bob.send(`<presence to="${ALICE}" type="subscribed"/>`);
      bob.send(`<presence to="${ALICE}" type="subscribe"/>`);

      await until(() => contacts.some((c) => c.jid === BOB), 'roster.onChange with bob');
      await until(
        () => contacts.some((c) => c.jid === BOB && c.subscription === 'both'),
        'subscription both',
      );
      const listed = await repositories.roster.list();
      expect(listed.find((c) => c.jid === BOB)).toMatchObject({
        name: 'Bob',
        subscription: 'both',
      });

      bob.send('<presence/>');
      await until(
        () => contacts.some((c) => c.jid === BOB && c.presence === 'online'),
        'bob online',
      );
      expect((await repositories.roster.list()).find((c) => c.jid === BOB)?.presence).toBe(
        'online',
      );
    },
    TIMEOUT,
  );

  it(
    '3. receives a message from bob, counts it unread, then marks it read',
    async () => {
      bob.send(
        `<message to="${ALICE}" type="chat" id="${RUN}-1"><body>hello from bob</body></message>`,
      );
      const message = await until(() => received[0], 'chat.onMessage');
      expect(message).toMatchObject({
        chatId: BOB,
        fromJid: BOB,
        body: 'hello from bob',
        direction: 'in',
        encryption: 'none',
      });
      const listed = await repositories.chat.list();
      expect(listed.find((c) => c.id === BOB)).toMatchObject({ kind: 'direct', unreadCount: 1 });

      chats.splice(0);
      await repositories.chat.markRead(BOB);
      await until(() => chats.some((c) => c.id === BOB && c.unreadCount === 0), 'unread 0');
    },
    TIMEOUT,
  );

  it(
    '4. sends a message that bob receives, delivered once his receipt arrives',
    async () => {
      bob.forget();
      const sent = await repositories.chat.send(BOB, 'hello from alice');
      expect(sent).toMatchObject({
        chatId: BOB,
        direction: 'out',
        body: 'hello from alice',
        status: 'sent',
      });

      const stanza = await bob.waitFor(isChatMessageFrom(ALICE));
      expect(stanza.getElementsByTagName('body')[0]?.textContent).toBe('hello from alice');
      expect(stanza.getElementsByTagNameNS('urn:xmpp:receipts', 'request')).toHaveLength(1);
      const id = stanza.getAttribute('id');
      bob.send(
        `<message to="${ALICE}" type="chat" id="${RUN}-receipt"><received xmlns="urn:xmpp:receipts" id="${id}"/></message>`,
      );
      await until(
        () => updated.some((m) => m.id === sent.id && m.status === 'delivered'),
        'delivered',
      );
    },
    TIMEOUT,
  );

  it(
    '5. catches up through MAM what bob sent while alice was signed out, and pages backwards',
    async () => {
      await repositories.xmpp.disconnect();
      expect(states.at(-1)).toBe('offline');
      const bodies = [1, 2, 3].map((n) => `while away ${RUN} ${n}`);
      bodies.forEach((body, i) => {
        bob.send(
          `<message to="${ALICE}" type="chat" id="${RUN}-away-${i}"><body>${body}</body></message>`,
        );
      });
      // No offline store on the server: mod_mam archives them and swallows the bounce. The server
      // handles a session's stanzas in order, so a ping answered means the three were archived.
      bob.send('<iq type="get" id="sync-1" to="localhost"><ping xmlns="urn:xmpp:ping"/></iq>');
      await bob.waitFor((s) => s.localName === 'iq' && s.getAttribute('id') === 'sync-1');

      await connectAlice();
      // The catch-up query runs after `chatBoxesFetched`: poll until its results are in.
      const deadline = Date.now() + TIMEOUT - 2_000;
      let messages: Message[] = [];
      while (Date.now() < deadline && !bodies.every((b) => messages.some((m) => m.body === b))) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        messages = await repositories.chat.messages(BOB);
      }
      const caughtUp = messages.filter((m) => bodies.includes(m.body));
      expect(caughtUp.map((m) => m.body)).toEqual(bodies);
      expect(caughtUp.every((m) => m.direction === 'in' && m.chatId === BOB)).toBe(true);
      expect(messages.map((m) => m.body)).toContain('hello from bob');

      const oldest = messages[0];
      if (!oldest) throw new Error('no messages');
      const older = await repositories.chat.messages(BOB, { before: oldest.id });
      expect(Array.isArray(older)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '6. signs out and in again',
    async () => {
      states.splice(0);
      await repositories.xmpp.disconnect();
      await connectAlice();
      expect(states).toEqual(['offline', 'online']);
    },
    TIMEOUT,
  );
});
