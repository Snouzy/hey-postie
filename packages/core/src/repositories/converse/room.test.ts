// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { DomainError } from '../../contracts/errors';
import type { Chat, Message, Room, RoomMember } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { JID, JULIET, type Mock, MockHarness, type Stanza } from './test-support/mockConverse';

/**
 * Rooms over the `MockConnection` (test-support/mockConverse.ts): the join handshake, the
 * presences, subjects and messages of XEP-0045 are injected by hand. Converse's own IQs (disco
 * on the room, member lists) are answered by `autoAnswer`. One Converse instance for the file.
 */

const SERVICE = 'rooms.montague.lit';
const HALL = `hall@${SERVICE}`;
const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  mockConnection: true,
  connectTimeoutMs: 300,
  joinTimeoutMs: 2_000,
});
const rooms: Room[] = [];
const members: Array<[string, RoomMember[]]> = [];
const received: Message[] = [];
const chats: Chat[] = [];
repositories.room.onChange((room) => rooms.push(room));
repositories.room.onMembersChange((jid, list) => members.push([jid, list]));
repositories.chat.onMessage((message) => received.push(message));
repositories.chat.onChatChange((chat) => chats.push(chat));

let harness: MockHarness;
let mock: Mock;
/** The rooms the service knows: disco#info answers `item-not-found` for the others (`is_new`). */
const known = new Set<string>();

beforeAll(async () => {
  harness = await MockHarness.create(repositories);
  mock = harness.mock;
  await harness.connectAndLoadRoster();
  harness.autoAnswer(serviceAnswers);
});

/**
 * The conference service of the mock: its own identity and room list, each room's disco#info
 * (name, occupants) and an error for everything else (member lists, configuration).
 */
function serviceAnswers(iq: Element): Stanza | undefined {
  const { stx, sizzle, Strophe } = mock.converse.env;
  const to = iq.getAttribute('to') ?? '';
  const isQuery = (ns: string) => sizzle(`query[xmlns="${ns}"]`, iq).length > 0;
  if (to === SERVICE && isQuery(Strophe.NS.DISCO_INFO)) {
    return stx`<iq type="result" xmlns="jabber:client"><query xmlns="${Strophe.NS.DISCO_INFO}">
      <identity category="conference" type="text" name="Rooms"/><feature var="${Strophe.NS.MUC}"/></query></iq>`;
  }
  if (to === SERVICE && isQuery(Strophe.NS.DISCO_ITEMS)) {
    return stx`<iq type="result" xmlns="jabber:client"><query xmlns="${Strophe.NS.DISCO_ITEMS}">
      <item jid="${HALL}" name="The Hall"/><item jid="cellar@${SERVICE}"/></query></iq>`;
  }
  if (!to.endsWith(`@${SERVICE}`)) return undefined;
  if (!isQuery(Strophe.NS.DISCO_INFO)) {
    return stx`<iq type="error" xmlns="jabber:client"><error type="cancel"><feature-not-implemented xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></iq>`;
  }
  if (!known.has(to)) {
    return stx`<iq type="error" xmlns="jabber:client"><error type="cancel"><item-not-found xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></iq>`;
  }
  return stx`<iq type="result" xmlns="jabber:client">
    <query xmlns="${Strophe.NS.DISCO_INFO}">
      <identity category="conference" type="text" name="The Hall"/>
      <feature var="${Strophe.NS.MUC}"/>
      <x xmlns="jabber:x:data" type="result">
        <field var="FORM_TYPE" type="hidden"><value>http://jabber.org/protocol/muc#roominfo</value></field>
        <field var="muc#roominfo_occupants"><value>2</value></field>
      </x>
    </query></iq>`;
}

async function joinPresenceSent(room: string): Promise<Element | undefined> {
  const { u, sizzle, Strophe } = mock.converse.env;
  const conn = await harness.connection();
  return u.waitUntil(() =>
    conn.sent_stanzas.find(
      (stanza) =>
        stanza.nodeName === 'presence' &&
        (stanza.getAttribute('to') ?? '').startsWith(`${room}/`) &&
        sizzle(`x[xmlns="${Strophe.NS.MUC}"]`, stanza).length > 0,
    ),
  );
}

function occupantPresence(room: string, nick: string, codes: string[], item: string): Stanza {
  const { stx } = mock.converse.env;
  const status = codes.map((code) => `<status code="${code}"/>`).join('');
  return stx`<presence from="${room}/${nick}" to="${JID}/orchard" xmlns="jabber:client">
    <x xmlns="http://jabber.org/protocol/muc#user">${stx([item + status] as unknown as TemplateStringsArray)}</x>
  </presence>`;
}

describe('ConverseRoomRepository', () => {
  it('joins a room once the self-presence arrives, and names it from disco', async () => {
    const joining = repositories.room.join({ jid: HALL, nick: 'romeo' });
    await joinPresenceSent(HALL);
    known.add(HALL);
    harness.inject(
      occupantPresence(
        HALL,
        'romeo',
        ['110'],
        `<item affiliation="owner" role="moderator" jid="${JID}/orchard"/>`,
      ),
    );
    const room = await joining;
    expect(room).toMatchObject({
      jid: HALL,
      nick: 'romeo',
      joined: true,
      bookmarked: false,
      notify: 'mentions',
      unreadCount: 0,
      mentionsCount: 0,
    });
    await mock.converse.env.u.waitUntil(() => rooms.some((r) => r.name === 'The Hall'));
    const listed = await repositories.room.list();
    expect(listed.map((r) => [r.jid, r.name, r.joined])).toEqual([[HALL, 'The Hall', true]]);
    expect((await repositories.chat.list()).find((c) => c.id === HALL)).toMatchObject({
      kind: 'room',
      title: 'The Hall',
      unreadCount: 0,
    });
  });

  it('reports the topic and the members', async () => {
    const { stx, u } = mock.converse.env;
    harness.inject(stx`<message from="${HALL}/romeo" to="${JID}/orchard" type="groupchat" xmlns="jabber:client">
      <subject>Welcome</subject></message>`);
    await u.waitUntil(() => rooms.some((r) => r.topic === 'Welcome'));

    harness.inject(
      occupantPresence(
        HALL,
        'juliet',
        [],
        `<item affiliation="member" role="participant" jid="${JULIET}/balcony"/>`,
      ),
    );
    await u.waitUntil(() => members.some(([, list]) => list.some((m) => m.nick === 'juliet')));
    const listed = await repositories.room.members(HALL);
    expect(listed.sort((a, b) => a.nick.localeCompare(b.nick))).toEqual([
      { nick: 'juliet', jid: JULIET, role: 'participant', affiliation: 'member' },
      { nick: 'romeo', jid: JID, role: 'moderator', affiliation: 'owner' },
    ]);
  });

  it('delivers a room message with the nick, the real JID and the mention', async () => {
    const { stx, u } = mock.converse.env;
    harness.inject(stx`<message from="${HALL}/juliet" to="${JID}/orchard" type="groupchat" id="g1" xmlns="jabber:client">
      <body>Romeo, wherefore art thou?</body></message>`);
    await u.waitUntil(() => received.length > 0);
    expect(received[0]).toMatchObject({
      chatId: HALL,
      fromJid: JULIET,
      fromNick: 'juliet',
      body: 'Romeo, wherefore art thou?',
      direction: 'in',
      isMention: true,
    });
    const [room] = await repositories.room.list();
    expect(room).toMatchObject({ unreadCount: 1, mentionsCount: 1 });
    expect(chats.filter((c) => c.id === HALL).at(-1)?.unreadCount).toBe(1);

    harness.inject(stx`<message from="${HALL}/juliet" to="${JID}/orchard" type="groupchat" id="g2" xmlns="jabber:client">
      <body>anyone?</body></message>`);
    await u.waitUntil(() => received.length > 1);
    expect(received[1]?.isMention).toBe(false);
    expect((await repositories.room.list())[0]).toMatchObject({ unreadCount: 2, mentionsCount: 1 });
  });

  it('sends to the room and clears the counters on markRead', async () => {
    const { sizzle } = mock.converse.env;
    const conn = await harness.connection();
    const before = conn.sent_stanzas.length;
    const sent = await repositories.chat.send(HALL, 'here');
    expect(sent).toMatchObject({ chatId: HALL, direction: 'out', fromNick: 'romeo', body: 'here' });
    const stanza = conn.sent_stanzas
      .slice(before)
      .find((s) => s.nodeName === 'message' && sizzle('body', s).length);
    expect(stanza?.getAttribute('type')).toBe('groupchat');
    expect(stanza?.getAttribute('to')).toBe(HALL);
    expect(received.find((m) => m.id === sent.id)).toBeUndefined();

    await repositories.chat.markRead(HALL);
    expect((await repositories.room.list())[0]).toMatchObject({ unreadCount: 0, mentionsCount: 0 });
    expect((await repositories.chat.messages(HALL)).map((m) => m.body)).toEqual([
      'Romeo, wherefore art thou?',
      'anyone?',
      'here',
    ]);
  });

  it('stores the notification rule per room and reports the change', async () => {
    const before = rooms.length;
    await repositories.room.setNotify(HALL, 'all');
    expect(rooms.length).toBe(before + 1);
    expect(rooms.at(-1)).toMatchObject({ jid: HALL, notify: 'all' });
    expect(localStorage.getItem(`hey-postie:${JID}:room-notify:${HALL}`)).toBe('all');
    expect((await repositories.room.list())[0]?.notify).toBe('all');
  });

  it('maps a refused join to the error of the presence, and forgets the room', async () => {
    const refuse = async (room: string, condition: string): Promise<DomainError> => {
      const { stx } = mock.converse.env;
      const joining = repositories.room.join({ jid: room, nick: 'romeo' });
      await joinPresenceSent(room);
      harness.inject(stx`<presence from="${room}/romeo" to="${JID}/orchard" type="error" xmlns="jabber:client">
        <error type="cancel">${stx([`<${condition} xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>`] as unknown as TemplateStringsArray)}</error>
      </presence>`);
      return joining.then(
        () => {
          throw new Error('joined');
        },
        (e: unknown) => e as DomainError,
      );
    };
    const taken = await refuse(`taken@${SERVICE}`, 'conflict');
    expect(taken.code, taken.message).toBe('NickTaken');
    expect(taken.message.startsWith('NickTaken')).toBe(true);
    const missing = await refuse(`missing@${SERVICE}`, 'item-not-found');
    expect(missing.code, missing.message).toBe('RoomNotFound');
    expect((await repositories.room.list()).map((r) => r.jid)).toEqual([HALL]);
  });

  it('times out with ServerUnreachable when the room never answers', async () => {
    const error = await repositories.room
      .join({ jid: `silent@${SERVICE}`, nick: 'romeo' })
      .catch((e: unknown) => e);
    expect((error as DomainError).code).toBe('ServerUnreachable');
  });

  it('lists the rooms of a conference service', async () => {
    expect(await repositories.room.roomService(SERVICE)).toBe(SERVICE);
    const listed = await repositories.room.browse(SERVICE);
    expect(listed).toEqual([
      { jid: HALL, name: 'The Hall', membersCount: 2 },
      { jid: `cellar@${SERVICE}`, name: 'cellar' },
    ]);
  });

  it('leaves the room and reports it as not joined', async () => {
    const { u } = mock.converse.env;
    const conn = await harness.connection();
    const before = conn.sent_stanzas.length;
    await repositories.room.leave(HALL);
    // `leave()` does not await `api.user.presence.send` (`plugins/muc/muc.js:977`).
    const unavailable = await u.waitUntil(() =>
      conn.sent_stanzas
        .slice(before)
        .find((s) => s.nodeName === 'presence' && s.getAttribute('type') === 'unavailable'),
    );
    expect(unavailable?.getAttribute('to')).toBe(`${HALL}/romeo`);
    expect(rooms.at(-1)).toMatchObject({ jid: HALL, joined: false, unreadCount: 0 });
    expect(await repositories.room.list()).toEqual([]);
    expect((await repositories.chat.list()).map((c) => c.id)).not.toContain(HALL);
    await expect(repositories.room.members(HALL)).rejects.toMatchObject({ code: 'RoomNotFound' });
  });
});
