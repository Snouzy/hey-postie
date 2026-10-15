// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { DomainError } from '../../contracts/errors';
import type { Message } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { FakeXmlHttpRequest } from './test-support/fakeXhr';
import { JID, JULIET, type Mock, MockHarness, type Stanza } from './test-support/mockConverse';

/**
 * Uploads (XEP-0363) and reactions (XEP-0444) over the `MockConnection` (test-support/mockConverse.ts):
 * the harness answers the disco and slot IQs, `FakeXmlHttpRequest` stands in for the PUT. One
 * Converse instance per file: the cases run in order.
 */

const UPLOAD = 'upload.montague.lit';
const HTTPUPLOAD = 'urn:xmpp:http:upload:0';
const REACTIONS = 'urn:xmpp:reactions:0';
const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  mockConnection: true,
  connectTimeoutMs: 300,
});
const updated: Message[] = [];
const received: Message[] = [];
repositories.chat.onMessageUpdate((message) => updated.push(message));
repositories.chat.onMessage((message) => received.push(message));

let harness: MockHarness;
let mock: Mock;
let maxFileSize = 1000;

const file = (name: string, size: number, type = 'image/png') =>
  new File([new Uint8Array(size)], name, { type });

/** disco#info of the domain and of its upload item, disco#items of the domain, and upload slots. */
function answerUploadDiscovery(iq: Element): Stanza | undefined {
  const { stx, sizzle } = mock.converse.env;
  const to = iq.getAttribute('to');
  if (sizzle('query[xmlns="http://jabber.org/protocol/disco#items"]', iq).length) {
    return to === 'montague.lit'
      ? stx`<iq type="result" xmlns="jabber:client"><query xmlns="http://jabber.org/protocol/disco#items"><item jid="${UPLOAD}"/></query></iq>`
      : stx`<iq type="result" xmlns="jabber:client"><query xmlns="http://jabber.org/protocol/disco#items"/></iq>`;
  }
  if (sizzle('query[xmlns="http://jabber.org/protocol/disco#info"]', iq).length) {
    if (to === UPLOAD) {
      return stx`<iq type="result" xmlns="jabber:client"><query xmlns="http://jabber.org/protocol/disco#info">
          <identity category="store" type="file"/><feature var="${HTTPUPLOAD}"/>
          <x xmlns="jabber:x:data" type="result">
            <field var="FORM_TYPE" type="hidden"><value>${HTTPUPLOAD}</value></field>
            <field var="max-file-size"><value>${maxFileSize}</value></field>
          </x></query></iq>`;
    }
    // Items are only queried when the entity advertises disco#items (`plugins/disco/entity.js:242`).
    return stx`<iq type="result" xmlns="jabber:client"><query xmlns="http://jabber.org/protocol/disco#info">
        <identity category="server" type="im"/><feature var="http://jabber.org/protocol/disco#items"/></query></iq>`;
  }
  const request = sizzle(`request[xmlns="${HTTPUPLOAD}"]`, iq)[0];
  if (request) {
    const name = request.getAttribute('filename') ?? 'file';
    return stx`<iq type="result" xmlns="jabber:client"><slot xmlns="${HTTPUPLOAD}">
        <put url="https://${UPLOAD}/put/${name}"><header name="Authorization">Basic x</header></put>
        <get url="https://${UPLOAD}/get/${name}"/></slot></iq>`;
  }
  return undefined;
}

beforeAll(async () => {
  harness = await MockHarness.create(repositories);
  mock = harness.mock;
  FakeXmlHttpRequest.install();
  await harness.connectAndLoadRoster();
  harness.autoAnswer(answerUploadDiscovery);
  // A roster contact: a stranger's chat would wait for the blocklist IQ, which the mock never answers.
  await repositories.chat.open(JULIET);
});

describe('maxFileSize', () => {
  it('reads max-file-size from the upload service and caches it', async () => {
    expect(await repositories.chat.maxFileSize()).toBe(1000);
    maxFileSize = 5;
    expect(await repositories.chat.maxFileSize()).toBe(1000);
    maxFileSize = 1000;
  });
});

describe('sendFile', () => {
  it('refuses a file above the limit before requesting a slot', async () => {
    const conn = await harness.connection();
    const before = conn.IQ_stanzas.length;
    const error = await repositories.chat
      .sendFile(JULIET, file('big.png', 1001))
      .catch((e: unknown) => e);
    expect((error as DomainError).code).toBe('FileTooLarge');
    expect(conn.IQ_stanzas.slice(before)).toEqual([]);
  });

  it('uploads with progress and resolves with the message carrying the attachment', async () => {
    FakeXmlHttpRequest.nextStatus = 201;
    const progress: number[] = [];
    const sent = await repositories.chat.sendFile(JULIET, file('cat.png', 100), (p) =>
      progress.push(p),
    );
    expect(progress).toEqual([0.5, 1]);
    expect(FakeXmlHttpRequest.last).toMatchObject({
      method: 'PUT',
      url: `https://${UPLOAD}/put/cat.png`,
      headers: { 'Content-type': 'image/png', Authorization: 'Basic x' },
    });
    expect(sent).toMatchObject({
      chatId: JULIET,
      direction: 'out',
      status: 'sent',
      body: '',
      attachments: [
        {
          url: `https://${UPLOAD}/get/cat.png`,
          name: 'cat.png',
          size: 100,
          mimeType: 'image/png',
          encryption: 'none',
        },
      ],
    });
    const listed = await repositories.chat.messages(JULIET);
    expect(listed.map((m) => m.id)).toEqual([sent.id]);
    const stanza = (await harness.connection()).sent_stanzas.at(-1) as Element;
    expect(stanza.querySelector('body')?.textContent).toBe(`https://${UPLOAD}/get/cat.png`);
    expect(stanza.getElementsByTagNameNS('jabber:x:oob', 'url')[0]?.textContent).toBe(
      `https://${UPLOAD}/get/cat.png`,
    );
  });

  it('rejects with Unknown when the PUT fails', async () => {
    FakeXmlHttpRequest.nextStatus = 500;
    const error = await repositories.chat
      .sendFile(JULIET, file('dog.png', 10))
      .catch((e: unknown) => e);
    expect((error as DomainError).code).toBe('Unknown');
    expect((await repositories.chat.messages(JULIET)).map((m) => m.attachments[0]?.name)).toEqual([
      'cat.png',
    ]);
  });
});

describe('react', () => {
  it('sends the XEP-0444 stanza with a store hint and reports our reaction', async () => {
    const { sizzle } = mock.converse.env;
    const [target] = await repositories.chat.messages(JULIET);
    if (!target) throw new Error('no message');
    updated.splice(0);
    await repositories.chat.react(JULIET, target.id, ['👍', '❤️']);
    const stanza = (await harness.connection()).sent_stanzas.at(-1) as Element;
    expect(stanza.getAttribute('to')).toBe(JULIET);
    expect(stanza.getAttribute('type')).toBe('chat');
    const reactions = sizzle(`reactions[xmlns="${REACTIONS}"]`, stanza)[0];
    expect(reactions?.getAttribute('id')).toBe(target.id);
    expect(Array.from(reactions?.children ?? []).map((r) => r.textContent)).toEqual(['👍', '❤️']);
    expect(sizzle('store[xmlns="urn:xmpp:hints"]', stanza)).toHaveLength(1);
    expect(updated.at(-1)?.reactions).toEqual([
      { emoji: '❤️', fromJids: [JID] },
      { emoji: '👍', fromJids: [JID] },
    ]);
  });

  it('merges an incoming reaction and removes ours when asked', async () => {
    const { stx, u } = mock.converse.env;
    const [target] = await repositories.chat.messages(JULIET);
    if (!target) throw new Error('no message');
    harness.inject(stx`<message from="${JULIET}/balcony" to="${JID}/orchard" type="chat" id="r1" xmlns="jabber:client">
        <reactions xmlns="${REACTIONS}" id="${target.id}"><reaction>👍</reaction></reactions>
        <store xmlns="urn:xmpp:hints"/></message>`);
    await u.waitUntil(() =>
      updated.some((m) => m.reactions.some((r) => r.fromJids.includes(JULIET))),
    );
    expect(updated.at(-1)?.reactions).toEqual([
      { emoji: '❤️', fromJids: [JID] },
      { emoji: '👍', fromJids: [JID, JULIET] },
    ]);
    expect(received.find((m) => m.id === 'r1')).toBeUndefined();

    await repositories.chat.react(JULIET, target.id, []);
    expect(updated.at(-1)?.reactions).toEqual([{ emoji: '👍', fromJids: [JULIET] }]);
    await expect(repositories.chat.react(JULIET, 'nope', ['x'])).rejects.toMatchObject({
      code: 'Unknown',
    });
  });

  it('advertises the reactions feature', async () => {
    expect(await harness.ownFeatures()).toContain(REACTIONS);
  });
});
