// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Message } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { AVAILABLE, type BobClient, connectBob, isChatMessageFrom } from './test-support/bobClient';
import { prepareContractEnvironment, until } from './test-support/contractEnv';

/**
 * Quote-replies against the real test server (spec 2026-10-17-conversation-slack, Lot B item 9):
 * alice is the app's repositories, bob a hand-written client that reads and writes XEP-0461
 * replies with the XEP-0428 fallback. Skipped unless `XMPP_TEST_SERVER` is set. Bodies carry a
 * run token: the server archives every run.
 */

const { SERVER, TIMEOUT } = await prepareContractEnvironment();
const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
const RUN = Date.now().toString(36);
const REPLY = 'urn:xmpp:reply:0';
const FALLBACK = 'urn:xmpp:fallback:0';

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  priority: 10,
  connectTimeoutMs: 8_000,
});
const received: Message[] = [];
repositories.chat.onMessage((message) => received.push(message));

let bob: BobClient;

const child = (stanza: Element, ns: string, name: string) =>
  stanza.getElementsByTagNameNS(ns, name)[0];
const bodyOf = (stanza: Element) => stanza.getElementsByTagName('body')[0]?.textContent ?? '';

describe.skipIf(!SERVER)('quote-replies against the XMPP test server', () => {
  beforeAll(async () => {
    bob = await connectBob({ url: SERVER ?? '', jid: BOB, password: 'bob-pw' });
    bob.send(AVAILABLE);
    await repositories.xmpp.connect({
      jid: ALICE,
      password: 'alice-pw',
      websocketUrl: SERVER ?? '',
    });
    await repositories.chat.open(BOB);
  }, TIMEOUT);

  afterAll(async () => {
    await bob.close();
    await repositories.xmpp.disconnect().catch(() => undefined);
  }, TIMEOUT);

  it(
    '1. alice replies to bob’s letter: bob gets <reply> naming it, and the quoted fallback',
    async () => {
      const id = `q-${RUN}`;
      bob.send(
        `<message to="${ALICE}" type="chat" id="${id}"><body>Lunch ${RUN}?</body></message>`,
      );
      const question = await until(
        () => received.find((message) => message.body === `Lunch ${RUN}?`),
        'bob’s letter',
      );
      bob.forget();
      const sent = await repositories.chat.send(BOB, `Yes ${RUN}`, { replyTo: question.id });
      const stanza = await bob.waitFor(
        (s) => isChatMessageFrom(ALICE)(s) && child(s, REPLY, 'reply') !== undefined,
      );
      const reply = child(stanza, REPLY, 'reply');
      expect(reply?.getAttribute('id')).toBe(id);
      expect(reply?.getAttribute('to')?.split('/')[0]).toBe(BOB);
      const body = bodyOf(stanza);
      expect(body.startsWith('> ')).toBe(true);
      expect(body).toContain(`> Lunch ${RUN}?`);
      expect(body.endsWith(`Yes ${RUN}`)).toBe(true);
      const range = child(child(stanza, FALLBACK, 'fallback') as Element, FALLBACK, 'body');
      const quoteLength = [...body].length - [...`Yes ${RUN}`].length;
      expect(range?.getAttribute('start')).toBe('0');
      expect(range?.getAttribute('end')).toBe(String(quoteLength));
      // Alice's own copy shows her text alone, with the quote of bob's letter above it.
      expect(sent.body).toBe(`Yes ${RUN}`);
      expect(sent.replyTo).toMatchObject({ id: question.id, excerpt: `Lunch ${RUN}?` });
    },
    TIMEOUT,
  );

  it(
    '2. bob replies to alice’s letter: alice’s message carries the reply, without the fallback',
    async () => {
      bob.forget();
      const mine = await repositories.chat.send(BOB, `Coffee ${RUN}?`);
      const stanza = await bob.waitFor(
        (s) => isChatMessageFrom(ALICE)(s) && bodyOf(s) === `Coffee ${RUN}?`,
      );
      const quote = `> alice:\n> Coffee ${RUN}?\n`;
      const end = [...quote].length;
      bob.send(
        `<message to="${ALICE}" type="chat" id="a-${RUN}"><body>${quote}Sure ${RUN}</body>` +
          `<reply xmlns="${REPLY}" to="${ALICE}" id="${stanza.getAttribute('id')}"/>` +
          `<fallback xmlns="${FALLBACK}" for="${REPLY}"><body start="0" end="${end}"/></fallback>` +
          '</message>',
      );
      const answer = await until(
        () => received.find((message) => message.body === `Sure ${RUN}`),
        'bob’s reply',
      );
      expect(answer.replyTo).toMatchObject({
        id: mine.id,
        mine: true,
        excerpt: `Coffee ${RUN}?`,
      });
    },
    TIMEOUT,
  );
});
