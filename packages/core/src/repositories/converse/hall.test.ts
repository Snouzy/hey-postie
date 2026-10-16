// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatState, Contact, ContactRequest } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { JID, JULIET, type Mock, MockHarness, type Stanza } from './test-support/mockConverse';

/**
 * Subscription requests, the blocklist, the own presence and avatar, chat states (converse.md
 * §17) over the `MockConnection`: stanzas injected by hand, IQs answered by `autoAnswer`. One
 * Converse instance for the file, the cases run in order.
 */

const STRANGER = 'tybalt@montague.lit';
/** On the server's blocklist at login, as the server spells it; the repository lowercases. */
const CAPULET = 'CAPULET@montague.lit';
const DOMAIN = 'montague.lit';
const BLOCKING = 'urn:xmpp:blocking';
const CHATSTATES = 'http://jabber.org/protocol/chatstates';
/** A 1x1 PNG, the smallest avatar the vCard can carry. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  mockConnection: true,
  connectTimeoutMs: 300,
});
const contacts: Contact[] = [];
const requests: ContactRequest[] = [];
const avatars: Array<string | undefined> = [];
const states: Array<[string, string, ChatState]> = [];
const blocklists: string[][] = [];
repositories.roster.onChange((contact) => contacts.push(contact));
repositories.roster.onRequest((request) => requests.push(request));
repositories.roster.onBlockedChange((jids) => blocklists.push(jids));
repositories.xmpp.onAvatarChange((url) => avatars.push(url));
repositories.chat.onChatState((chatId, fromJid, state) => states.push([chatId, fromJid, state]));

let harness: MockHarness;
let mock: Mock;
let stopAnswering: () => void;

beforeAll(async () => {
  harness = await MockHarness.create(repositories);
  mock = harness.mock;
  stopAnswering = harness.autoAnswer(answers);
  await harness.connectAndLoadRoster();
});

/** The server advertises XEP-0191, its blocklist holds one JID, our vCard carries a photo. */
function answers(iq: Element, blocking = true): Stanza | undefined {
  const { stx, sizzle, Strophe } = mock.converse.env;
  const to = iq.getAttribute('to');
  if (to === DOMAIN && sizzle(`query[xmlns="${Strophe.NS.DISCO_INFO}"]`, iq).length) {
    return stx`<iq type="result" xmlns="jabber:client"><query xmlns="${Strophe.NS.DISCO_INFO}">
      <identity category="server" type="im"/>${blocking ? stx`<feature var="${BLOCKING}"/>` : ''}
      </query></iq>`;
  }
  if (sizzle(`blocklist[xmlns="${BLOCKING}"]`, iq).length) {
    return stx`<iq type="result" xmlns="jabber:client"><blocklist xmlns="${BLOCKING}">
      <item jid="${CAPULET}"/></blocklist></iq>`;
  }
  if (sizzle(`block[xmlns="${BLOCKING}"], unblock[xmlns="${BLOCKING}"]`, iq).length) {
    return stx`<iq type="result" xmlns="jabber:client"/>`;
  }
  if ((!to || to === JID) && sizzle('vCard[xmlns="vcard-temp"]', iq).length) {
    return stx`<iq type="result" xmlns="jabber:client"><vCard xmlns="vcard-temp">
      <FN>Romeo</FN><PHOTO><TYPE>image/png</TYPE><BINVAL>${PNG}</BINVAL></PHOTO></vCard></iq>`;
  }
  return undefined;
}

function sentAfter(count: number): Element[] {
  return mock.api.connection.get()?.sent_stanzas.slice(count) ?? [];
}

function sentCount(): number {
  return mock.api.connection.get()?.sent_stanzas.length ?? 0;
}

function presenceTo(stanzas: Element[], jid: string, type: string): Element | undefined {
  return stanzas.find(
    (s) =>
      s.tagName === 'presence' && s.getAttribute('to') === jid && s.getAttribute('type') === type,
  );
}

describe('ConverseRosterRepository: subscription requests', () => {
  it('reports a stranger asking to subscribe, with the sentence of the presence', async () => {
    const { stx, u } = mock.converse.env;
    const before = contacts.length;
    harness.inject(stx`<presence from="${STRANGER}" to="${JID}" type="subscribe" xmlns="jabber:client">
        <nick xmlns="http://jabber.org/protocol/nick">Tybalt</nick><status>Hello cousin</status>
      </presence>`);
    await u.waitUntil(() => requests.length > 0);
    expect(requests).toEqual([{ jid: STRANGER, name: 'Tybalt', message: 'Hello cousin' }]);
    expect(await repositories.roster.requests()).toEqual(requests);
    expect((await repositories.roster.list()).map((c) => c.jid)).not.toContain(STRANGER);
    expect(contacts.slice(before).map((c) => c.jid)).not.toContain(STRANGER);
  });

  it('declines: unsubscribed goes out, the request is gone, nothing is listed', async () => {
    const before = sentCount();
    const changes = contacts.length;
    await repositories.roster.decline(STRANGER);
    expect(presenceTo(sentAfter(before), STRANGER, 'unsubscribed')).toBeDefined();
    expect(await repositories.roster.requests()).toEqual([]);
    expect(contacts.slice(changes).map((c) => c.jid)).not.toContain(STRANGER);
    await expect(repositories.roster.accept(STRANGER)).rejects.toMatchObject({ code: 'Unknown' });
  });

  it('accepts: subscribed then subscribe go out and the contact is listed as from', async () => {
    const { stx, u } = mock.converse.env;
    requests.splice(0);
    harness.inject(
      stx`<presence from="${STRANGER}" to="${JID}" type="subscribe" xmlns="jabber:client"/>`,
    );
    await u.waitUntil(() => requests.length > 0);
    expect(requests[0]).toEqual({ jid: STRANGER, name: 'tybalt' });

    const before = sentCount();
    const accepted = await repositories.roster.accept(STRANGER);
    expect(accepted).toMatchObject({ jid: STRANGER, name: 'tybalt', subscription: 'from' });
    expect(presenceTo(sentAfter(before), STRANGER, 'subscribed')).toBeDefined();
    // The subscribe back goes through `api.user.presence.send`, which awaits the status plugin.
    await u.waitUntil(() => presenceTo(sentAfter(before), STRANGER, 'subscribe'));
    expect(await repositories.roster.requests()).toEqual([]);
    expect((await repositories.roster.list()).find((c) => c.jid === STRANGER)).toMatchObject({
      subscription: 'from',
    });
    expect(contacts.at(-1)).toMatchObject({ jid: STRANGER, subscription: 'from' });
  });

  it('blocks: the XEP-0191 IQ goes out and a pending request of that JID is dropped', async () => {
    const { stx, u, sizzle } = mock.converse.env;
    const other = 'paris@montague.lit';
    requests.splice(0);
    harness.inject(
      stx`<presence from="${other}" to="${JID}" type="subscribe" xmlns="jabber:client"/>`,
    );
    await u.waitUntil(() => requests.length > 0);

    const before = sentCount();
    await repositories.roster.block(other);
    const sent = sentAfter(before);
    const block = sent.find(
      (s) => sizzle(`block[xmlns="${BLOCKING}"] item[jid="${other}"]`, s).length,
    );
    expect(block).toBeDefined();
    expect(presenceTo(sent, other, 'unsubscribed')).toBeDefined();
    expect(await repositories.roster.requests()).toEqual([]);
    expect(await repositories.roster.blocked()).toContain(other);

    const unblockBefore = sentCount();
    await repositories.roster.unblock(other);
    const unblock = sentAfter(unblockBefore).find(
      (s) => sizzle(`unblock[xmlns="${BLOCKING}"] item[jid="${other}"]`, s).length,
    );
    expect(unblock).toBeDefined();
    expect(await repositories.roster.blocked()).not.toContain(other);
  });
});

describe('ConverseRosterRepository: blocklist', () => {
  const capulet = CAPULET.toLowerCase();
  const benvolio = 'benvolio@montague.lit';

  it('lists the blocklist fetched at login, bare and lowercase', async () => {
    expect(await repositories.roster.blocked()).toEqual([capulet]);
    // The block and unblock of the previous case each handed out the whole list.
    expect(blocklists.slice(-2)).toEqual([[capulet, 'paris@montague.lit'], [capulet]]);
  });

  it('a push from the server adds one and the whole list is handed out', async () => {
    const { stx, u } = mock.converse.env;
    const before = blocklists.length;
    harness.inject(stx`<iq type="set" id="push-1" to="${JID}" xmlns="jabber:client">
        <block xmlns="${BLOCKING}"><item jid="${benvolio}"/></block></iq>`);
    await u.waitUntil(() => blocklists.length > before);
    expect(blocklists.at(-1)).toEqual([capulet, benvolio]);
    expect(await repositories.roster.blocked()).toEqual([capulet, benvolio]);
  });

  it('an unblock removes one and hands out the rest', async () => {
    const before = blocklists.length;
    await repositories.roster.unblock(benvolio);
    expect(blocklists.slice(before)).toEqual([[capulet]]);
    expect(await repositories.roster.blocked()).toEqual([capulet]);
  });
});

describe('ConverseXmppRepository: presence and avatar', () => {
  it('sends show and status, and no show for online', async () => {
    const before = sentCount();
    await repositories.xmpp.setPresence({ show: 'away', status: 'Out for lunch' });
    const away = sentAfter(before).find((s) => s.tagName === 'presence');
    expect(away?.querySelector('show')?.textContent).toBe('away');
    expect(away?.querySelector('status')?.textContent).toBe('Out for lunch');

    const again = sentCount();
    await repositories.xmpp.setPresence({ show: 'online' });
    const online = sentAfter(again).find((s) => s.tagName === 'presence');
    expect(online?.querySelector('show')).toBeNull();
    expect(online?.querySelector('status')).toBeNull();
  });

  it('hands out the own vCard photo as a data URL', async () => {
    const { u } = mock.converse.env;
    await u.waitUntil(() => avatars.length > 0);
    expect(avatars[0]).toBe(`data:image/png;base64,${PNG}`);
  });
});

describe('ConverseChatRepository: chat states', () => {
  it('sends composing and paused as XEP-0085 messages', async () => {
    const { sizzle } = mock.converse.env;
    await repositories.chat.open(JULIET);
    const before = sentCount();
    await repositories.chat.setComposing(JULIET, true);
    await repositories.chat.setComposing(JULIET, true);
    await repositories.chat.setComposing(JULIET, false);
    const sent = sentAfter(before).filter(
      (s) => s.tagName === 'message' && s.getAttribute('to') === JULIET,
    );
    const state = (s: Element) => sizzle(`[xmlns="${CHATSTATES}"]`, s)[0]?.tagName;
    expect(sent.map(state)).toEqual(['composing', 'composing', 'paused']);
    expect(sent.every((s) => !s.querySelector('body'))).toBe(true);
  });

  it('reports the peer composing, then active once the message arrives', async () => {
    const { stx, u } = mock.converse.env;
    harness.inject(stx`<message from="${JULIET}/balcony" to="${JID}/orchard" type="chat" xmlns="jabber:client">
        <composing xmlns="${CHATSTATES}"/></message>`);
    await u.waitUntil(() => states.length > 0);
    expect(states.at(-1)).toEqual([JULIET, JULIET, 'composing']);
    harness.inject(stx`<message from="${JULIET}/balcony" to="${JID}/orchard" type="chat" id="cs-1" xmlns="jabber:client">
        <body>typed</body><active xmlns="${CHATSTATES}"/></message>`);
    await u.waitUntil(() => states.at(-1)?.[2] === 'active');
    expect(states.at(-1)).toEqual([JULIET, JULIET, 'active']);
  });
});

describe('ConverseRosterRepository: a server without XEP-0191', () => {
  it('refuses to read the blocklist with Unknown', async () => {
    await repositories.xmpp.disconnect();
    stopAnswering();
    harness.autoAnswer((iq) => answers(iq, false));
    await harness.connectAndLoadRoster();
    await expect(repositories.roster.blocked()).rejects.toMatchObject({
      code: 'Unknown',
      message: 'Unknown: the server has no blocklist (XEP-0191)',
    });
  });
});
