// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Message } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { AVAILABLE, type BobClient, connectBob, isChatMessageFrom } from './test-support/bobClient';
import { prepareContractEnvironment, until } from './test-support/contractEnv';

/**
 * Editing and deleting against the real test server (spec 2026-10-16-edit-delete-messages): alice
 * is the app's repositories, bob a hand-written client. Skipped unless `XMPP_TEST_SERVER` is set
 * (`pnpm test:contract`). Bodies carry a run token: the server archives every run.
 */

const { SERVER, TIMEOUT } = await prepareContractEnvironment();
const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
const RUN = Date.now().toString(36);
const CORRECT = 'urn:xmpp:message-correct:0';
const RETRACT = 'urn:xmpp:message-retract:1';
const SID = 'urn:xmpp:sid:0';

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  priority: 10,
  connectTimeoutMs: 8_000,
});
const updated: Message[] = [];
const received: Message[] = [];
repositories.chat.onMessageUpdate((message) => updated.push(message));
repositories.chat.onMessage((message) => received.push(message));

let bob: BobClient;

const child = (stanza: Element, ns: string, name: string) =>
  stanza.getElementsByTagNameNS(ns, name)[0];
const bodyOf = (stanza: Element) => stanza.getElementsByTagName('body')[0]?.textContent ?? '';

describe.skipIf(!SERVER)('editing and deleting against the XMPP test server', () => {
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
    '1. corrects a letter: bob gets a replace of the first one, alice keeps the earlier text',
    async () => {
      bob.forget();
      const sent = await repositories.chat.send(BOB, `v1 ${RUN}`);
      const first = await bob.waitFor(
        (s) => isChatMessageFrom(ALICE)(s) && bodyOf(s) === `v1 ${RUN}`,
      );
      const corrected = await repositories.chat.correct(BOB, sent.id, `v2 ${RUN}`);
      const replace = await bob.waitFor(
        (s) => isChatMessageFrom(ALICE)(s) && child(s, CORRECT, 'replace') !== undefined,
      );
      expect(bodyOf(replace)).toBe(`v2 ${RUN}`);
      expect(child(replace, CORRECT, 'replace')?.getAttribute('id')).toBe(first.getAttribute('id'));
      expect(corrected).toMatchObject({ id: sent.id, body: `v2 ${RUN}`, edited: true });
      expect(corrected.versions?.map((version) => version.body)).toEqual([`v1 ${RUN}`]);
    },
    TIMEOUT,
  );

  it(
    '2. takes a letter back: bob gets a retraction naming it, alice shows it deleted',
    async () => {
      bob.forget();
      const sent = await repositories.chat.send(BOB, `gone ${RUN}`);
      const original = await bob.waitFor(
        (s) => isChatMessageFrom(ALICE)(s) && bodyOf(s) === `gone ${RUN}`,
      );
      await repositories.chat.retract(BOB, sent.id);
      const retraction = await bob.waitFor((s) => child(s, RETRACT, 'retract') !== undefined);
      const named = child(retraction, RETRACT, 'retract')?.getAttribute('id');
      const ids = [
        original.getAttribute('id'),
        child(original, SID, 'origin-id')?.getAttribute('id'),
      ];
      expect(ids).toContain(named);
      const shown = await repositories.chat.message(BOB, sent.id);
      expect(shown).toMatchObject({ retracted: true, retractedBy: 'sender', body: '' });
    },
    TIMEOUT,
  );

  it(
    '3. bob corrects his letter: alice sees it edited, with what it said before',
    async () => {
      const id = `b1-${RUN}`;
      bob.send(`<message to="${ALICE}" type="chat" id="${id}"><body>typo ${RUN}</body></message>`);
      await until(() => received.some((message) => message.body === `typo ${RUN}`), 'bob’s letter');
      bob.send(
        `<message to="${ALICE}" type="chat" id="b2-${RUN}"><body>fixed ${RUN}</body><replace xmlns="${CORRECT}" id="${id}"/></message>`,
      );
      await until(
        () => updated.some((message) => message.body === `fixed ${RUN}`),
        'bob’s correction',
      );
      const fixed = updated.filter((message) => message.body === `fixed ${RUN}`).at(-1);
      expect(fixed).toMatchObject({ edited: true });
      expect(fixed?.versions?.map((version) => version.body)).toEqual([`typo ${RUN}`]);
    },
    TIMEOUT,
  );
});
