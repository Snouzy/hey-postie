// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCore } from '../../container';
import type { Message } from '../../contracts/types';
import { createFakeDependencies } from '../../fakes';
import { createConverseRepositories } from './index';
import { type BobClient, connectBob, isChatMessageFrom } from './test-support/bobClient';
import { prepareContractEnvironment, until } from './test-support/contractEnv';

/**
 * Uploads (XEP-0363 through Prosody's `mod_http_file_share`, `upload.localhost`, 10 MB) and
 * reactions (XEP-0444) against the real server (tools/xmpp-server), alice through the repositories
 * and bob through the hand-written client. Skipped unless `XMPP_TEST_SERVER` is set. The engine's
 * `fetch` is the asset stub of `contractEnv.ts`: the download goes through the real one, kept here
 * before the stub is installed, which `NODE_EXTRA_CA_CERTS` makes trust the mkcert CA.
 */

const realFetch = globalThis.fetch;
const { SERVER, TIMEOUT } = await prepareContractEnvironment();
if (SERVER) {
  const assets = window.fetch;
  window.fetch = (input, init) =>
    String(input).includes('localhost:5281') ? realFetch(input, init) : assets(input, init);
}

const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
const RUN = Date.now().toString(36);
const REACTIONS = 'urn:xmpp:reactions:0';

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  priority: 10,
  connectTimeoutMs: 8_000,
});
const core = createCore({ ...createFakeDependencies(), ...repositories });
const updated: Message[] = [];
repositories.chat.onMessageUpdate((message) => updated.push(message));

let bob: BobClient;

describe.skipIf(!SERVER)('Parcels and reactions against the XMPP test server', () => {
  beforeAll(async () => {
    bob = await connectBob({ url: SERVER ?? '', jid: BOB, password: 'bob-pw' });
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
    '1. reads the upload limit from the server',
    async () => {
      expect(await repositories.chat.maxFileSize()).toBe(10 * 1024 * 1024);
      expect(await core.files.maxFileSize()).toBe(10 * 1024 * 1024);
    },
    TIMEOUT,
  );

  it(
    '2. uploads a file that bob receives as an upload.localhost URL, then downloads it back',
    async () => {
      bob.forget();
      const content = new TextEncoder().encode(`parcel ${RUN}`);
      const file = new File([content], `parcel-${RUN}.txt`, { type: 'text/plain' });
      const progress: number[] = [];
      const sent = await core.files.send(BOB, file, (p) => progress.push(p));
      expect(progress.at(-1)).toBe(1);
      expect(sent).toMatchObject({ chatId: BOB, direction: 'out', body: '' });
      const [attachment] = sent.attachments;
      expect(attachment).toMatchObject({
        name: file.name,
        size: content.byteLength,
        mimeType: 'text/plain',
        encryption: 'none',
      });
      expect(attachment?.url.startsWith('https://upload.localhost')).toBe(true);

      const stanza = await bob.waitFor(isChatMessageFrom(ALICE));
      expect(stanza.getElementsByTagName('body')[0]?.textContent).toBe(attachment?.url);
      expect(stanza.getElementsByTagNameNS('jabber:x:oob', 'url')[0]?.textContent).toBe(
        attachment?.url,
      );

      if (!attachment) throw new Error('no attachment');
      const blob = await core.files.fetch(attachment);
      expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe(`parcel ${RUN}`);
    },
    TIMEOUT * 3,
  );

  it(
    '3. refuses a file above the limit without uploading',
    async () => {
      await expect(
        core.files.send(BOB, new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.bin')),
      ).rejects.toMatchObject({ code: 'FileTooLarge' });
    },
    TIMEOUT,
  );

  it(
    "4. shows bob's reaction to alice's message, and bob receives alice's",
    async () => {
      bob.forget();
      const sent = await repositories.chat.send(BOB, `react to me ${RUN}`);
      const stanza = await bob.waitFor(isChatMessageFrom(ALICE));
      const id = stanza.getAttribute('id');
      bob.send(
        `<message to="${ALICE}" type="chat" id="${RUN}-r1"><reactions xmlns="${REACTIONS}" id="${id}"><reaction>👍</reaction></reactions><store xmlns="urn:xmpp:hints"/></message>`,
      );
      await until(
        () => updated.find((m) => m.id === sent.id && m.reactions.length > 0),
        "bob's reaction",
      );
      expect(updated.at(-1)?.reactions).toEqual([{ emoji: '👍', fromJids: [BOB], mine: false }]);

      bob.forget();
      await core.chats.toggleReaction(BOB, sent.id, '🎉');
      const reaction = await bob.waitFor(
        (s) =>
          s.localName === 'message' && s.getElementsByTagNameNS(REACTIONS, 'reactions').length > 0,
      );
      const element = reaction.getElementsByTagNameNS(REACTIONS, 'reactions')[0];
      expect(element?.getAttribute('id')).toBe(id);
      expect(Array.from(element?.children ?? []).map((r) => r.textContent)).toEqual(['🎉']);
      expect(updated.at(-1)?.reactions).toEqual([
        { emoji: '🎉', fromJids: [ALICE], mine: true },
        { emoji: '👍', fromJids: [BOB], mine: false },
      ]);
    },
    TIMEOUT,
  );
});
