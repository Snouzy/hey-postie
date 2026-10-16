// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Message } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { AVAILABLE, type BobClient, connectBob, isChatMessageFrom } from './test-support/bobClient';
import { prepareContractEnvironment, until } from './test-support/contractEnv';

/**
 * The "read" stamp against the real test server (spec 2026-10-17-conversation-slack, Lot A item
 * 2): alice is the app's repositories, bob a hand-written client that sends XEP-0333 markers.
 * Skipped unless `XMPP_TEST_SERVER` is set. Bodies carry a run token: the server archives every run.
 */

const { SERVER, TIMEOUT } = await prepareContractEnvironment();
const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
const RUN = Date.now().toString(36);
const MARKERS = 'urn:xmpp:chat-markers:0';

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  priority: 10,
  connectTimeoutMs: 8_000,
});
const updated: Message[] = [];
repositories.chat.onMessageUpdate((message) => updated.push(message));

let bob: BobClient;

const bodyOf = (stanza: Element) => stanza.getElementsByTagName('body')[0]?.textContent ?? '';

describe.skipIf(!SERVER)('read markers against the XMPP test server', () => {
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
    'bob displays alice’s second letter: both her letters read, the third not',
    async () => {
      bob.forget();
      const sent: Message[] = [];
      for (const word of ['one', 'two', 'three']) {
        sent.push(await repositories.chat.send(BOB, `${word} ${RUN}`));
        await bob.waitFor((s) => isChatMessageFrom(ALICE)(s) && bodyOf(s) === `${word} ${RUN}`);
      }
      const [one, two, three] = sent as [Message, Message, Message];
      bob.send(
        `<message to="${ALICE}" type="chat" id="d-${RUN}"><displayed xmlns="${MARKERS}" id="${two.id}"/></message>`,
      );
      await until(
        () => updated.some((message) => message.id === two.id && message.status === 'read'),
        'the read stamp',
      );
      const status = async (id: string) => (await repositories.chat.message(BOB, id))?.status;
      expect(await status(one.id)).toBe('read');
      expect(await status(two.id)).toBe('read');
      expect(await status(three.id)).not.toBe('read');
    },
    TIMEOUT,
  );
});
