// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { DomainError } from '../../contracts/errors';
import type { Chat, Message, Room, RoomMember } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { until } from './test-support/contractEnv';
import { JID, JULIET, type Mock, MockHarness, type Stanza } from './test-support/mockConverse';

interface MucModel {
  get(key: string): unknown;
  occupants: { models: Array<{ get(key: string): unknown }> };
  clearUnreadMsgCounter(): Promise<unknown>;
}

/**
 * Rooms over the `MockConnection` (test-support/mockConverse.ts): the join handshake, the
 * presences, subjects and messages of XEP-0045 are injected by hand. Converse's own IQs (disco
 * on the room and on our own JID, member lists, the PEP bookmark node) are answered by
 * `autoAnswer`, so that the bookmarks collection exists. One Converse instance for the file.
 */

const SERVICE = 'rooms.montague.lit';
const HALL = `hall@${SERVICE}`;
const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  mockConnection: true,
  connectTimeoutMs: 300,
  // Generous: the whole core suite runs in parallel workers and slows the mock's round trips.
  joinTimeoutMs: 4_000,
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
/** The pubsub `retract` of a bookmark is refused while this is set. */
let refuseRetract = false;
const PUBSUB = 'http://jabber.org/protocol/pubsub';
const BOOKMARKS = 'urn:xmpp:bookmarks:1';

beforeAll(async () => {
  harness = await MockHarness.create(repositories);
  mock = harness.mock;
  harness.autoAnswer((iq) => serviceAnswers(iq) ?? accountAnswers(iq));
  await harness.connectAndLoadRoster();
  await mock.api.waitUntil('bookmarksInitialized');
});

/** Our own account: PEP with publish-options (what the bookmarks plugin requires) and its nodes. */
function accountAnswers(iq: Element): Stanza | undefined {
  const { stx, sizzle, Strophe } = mock.converse.env;
  // The bookmarks fetch carries no `to` at all (`plugins/bookmarks/collection.js`).
  const to = iq.getAttribute('to');
  if (to && to !== JID) return undefined;
  if (sizzle(`query[xmlns="${Strophe.NS.DISCO_INFO}"]`, iq).length) {
    return stx`<iq type="result" xmlns="jabber:client"><query xmlns="${Strophe.NS.DISCO_INFO}">
      <identity category="pubsub" type="pep"/>
      <feature var="${PUBSUB}#publish-options"/><feature var="${BOOKMARKS}#compat"/></query></iq>`;
  }
  // `getIdentity` waits for the entity's items too (`plugins/disco/entity.js:64`).
  if (sizzle(`query[xmlns="${Strophe.NS.DISCO_ITEMS}"]`, iq).length) {
    return stx`<iq type="result" xmlns="jabber:client"><query xmlns="${Strophe.NS.DISCO_ITEMS}"/></iq>`;
  }
  if (sizzle(`pubsub items[node="${BOOKMARKS}"]`, iq).length) {
    return stx`<iq type="result" xmlns="jabber:client"><pubsub xmlns="${PUBSUB}"><items node="${BOOKMARKS}"/></pubsub></iq>`;
  }
  if (refuseRetract && sizzle('pubsub retract', iq).length) {
    return stx`<iq type="error" xmlns="jabber:client"><error type="cancel"><item-not-found xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></iq>`;
  }
  if (sizzle('pubsub', iq).length) return stx`<iq type="result" xmlns="jabber:client"/>`;
  return undefined;
}

/** The last bookmark publication sent to PEP, with its `<conference>` element. */
function lastPublishedBookmark(): Element | undefined {
  const { sizzle } = mock.converse.env;
  const conn = mock.api.connection.get();
  return conn?.IQ_stanzas.map((iq) => sizzle(`publish[node="${BOOKMARKS}"] conference`, iq)[0])
    .filter((e): e is Element => Boolean(e))
    .pop();
}

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
  if (to === 'nowhere.montague.lit') {
    return stx`<iq type="error" xmlns="jabber:client"><error type="cancel"><item-not-found xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></iq>`;
  }
  if (!to.endsWith(`@${SERVICE}`)) return undefined;
  // The member list (XEP-0045 §9.5): one affiliated member who is not in the room.
  if (
    sizzle('query[xmlns="http://jabber.org/protocol/muc#admin"] item[affiliation="member"]', iq)
      .length
  ) {
    return stx`<iq type="result" xmlns="jabber:client"><query xmlns="http://jabber.org/protocol/muc#admin">
      <item affiliation="member" jid="tybalt@montague.lit"/></query></iq>`;
  }
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
  const { sizzle, Strophe } = mock.converse.env;
  const conn = await harness.connection();
  return until(
    () =>
      conn.sent_stanzas.find(
        (stanza) =>
          stanza.nodeName === 'presence' &&
          (stanza.getAttribute('to') ?? '').startsWith(`${room}/`) &&
          sizzle(`x[xmlns="${Strophe.NS.MUC}"]`, stanza).length > 0,
      ),
    'condition',
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
    // An existing room: its disco#info answers at once (a new one is re-queried after the join).
    known.add(HALL);
    const joining = repositories.room.join({ jid: HALL, nick: 'romeo' });
    await joinPresenceSent(HALL);
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
    await until(() => rooms.some((r) => r.name === 'The Hall'), 'condition');
    // `enteredNewRoom` makes Converse bookmark every room it enters, autojoin on.
    await until(() => rooms.some((r) => r.jid === HALL && r.bookmarked), 'condition');
    const listed = await repositories.room.list();
    expect(listed.map((r) => [r.jid, r.name, r.joined])).toEqual([[HALL, 'The Hall', true]]);
    expect(lastPublishedBookmark()?.getAttribute('autojoin')).toBe('true');
    expect((await repositories.chat.list()).find((c) => c.id === HALL)).toMatchObject({
      kind: 'room',
      title: 'The Hall',
      unreadCount: 0,
    });
  });

  it('reports the topic and the members', async () => {
    const { stx } = mock.converse.env;
    harness.inject(stx`<message from="${HALL}/romeo" to="${JID}/orchard" type="groupchat" xmlns="jabber:client">
      <subject>Welcome</subject></message>`);
    await until(() => rooms.some((r) => r.topic === 'Welcome'), 'condition');

    harness.inject(
      occupantPresence(
        HALL,
        'juliet',
        [],
        `<item affiliation="member" role="participant" jid="${JULIET}/balcony"/>`,
      ),
    );
    await until(
      () => members.some(([, list]) => list.some((m) => m.nick === 'juliet')),
      'condition',
    );
    const listed = await repositories.room.members(HALL);
    expect(listed.sort((a, b) => a.nick.localeCompare(b.nick))).toEqual([
      { nick: 'juliet', jid: JULIET, role: 'participant', affiliation: 'member' },
      { nick: 'romeo', jid: JID, role: 'moderator', affiliation: 'owner' },
    ]);
    // The member list fetched on entering lists tybalt, who is not in the room.
    const muc = mock._converse.state.chatboxes.get(HALL) as unknown as MucModel;
    await until(
      () => muc.occupants.models.some((o) => o.get('jid') === 'tybalt@montague.lit'),
      'condition',
    );
    expect((await repositories.room.members(HALL)).map((m) => m.nick)).not.toContain('tybalt');
  });

  it('delivers a room message with the nick, the real JID and the mention', async () => {
    const { stx } = mock.converse.env;
    harness.inject(stx`<message from="${HALL}/juliet" to="${JID}/orchard" type="groupchat" id="g1" xmlns="jabber:client">
      <body>Romeo, wherefore art thou?</body></message>`);
    await until(() => received.length > 0, 'condition');
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
    await until(() => received.length > 1, 'condition');
    expect(received[1]?.isMention).toBe(false);
    expect((await repositories.room.list())[0]).toMatchObject({ unreadCount: 2, mentionsCount: 1 });
  });

  it('adds the link preview the hall fastens to a letter, and flags an unstyled one', async () => {
    const { stx } = mock.converse.env;
    const updated: Message[] = [];
    repositories.chat.onMessageUpdate((message) => updated.push(message));
    harness.inject(stx`<message from="${HALL}/juliet" to="${JID}/orchard" type="groupchat" id="g3" xmlns="jabber:client">
      <body>&gt; _ &lt; see https://example.org/news</body>
      <origin-id xmlns="urn:xmpp:sid:0" id="o3"/>
      <unstyled xmlns="urn:xmpp:styling:0"/></message>`);
    await until(() => received.some((m) => m.id === 'g3' || m.body.endsWith('news')), 'letter');
    const letter = received.find((m) => m.body.endsWith('news'));
    expect(letter?.unstyled).toBe(true);
    expect(letter?.linkPreviews).toBeUndefined();

    // A member cannot attach a preview: only the room's own JID can (Converse's rule).
    const fasten = (from: string, title: string) =>
      stx`<message from="${from}" to="${JID}/orchard" type="groupchat" id="${title}" xmlns="jabber:client">
        <apply-to xmlns="urn:xmpp:fasten:0" id="o3">
          <meta xmlns="http://www.w3.org/1999/xhtml" property="og:url" content="https://example.org/news"/>
          <meta xmlns="http://www.w3.org/1999/xhtml" property="og:title" content="${title}"/>
          <meta xmlns="http://www.w3.org/1999/xhtml" property="og:site_name" content="Example"/>
        </apply-to></message>`;
    harness.inject(fasten(`${HALL}/juliet`, 'Forged'));
    harness.inject(fasten(HALL, 'News'));
    await until(() => updated.some((m) => m.linkPreviews !== undefined), 'preview');
    expect(updated.find((m) => m.linkPreviews)?.linkPreviews).toEqual([
      { url: 'https://example.org/news', title: 'News', siteName: 'Example' },
    ]);
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

    // The MUC clears its counters only after sending a marker: `markRead` must await that.
    const muc = mock._converse.state.chatboxes.get(HALL) as unknown as MucModel;
    const clear = muc.clearUnreadMsgCounter.bind(muc);
    muc.clearUnreadMsgCounter = async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return clear();
    };
    await repositories.chat.markRead(HALL);
    expect(muc.get('num_unread_general')).toBe(0);
    expect((await repositories.room.list())[0]).toMatchObject({ unreadCount: 0, mentionsCount: 0 });
    expect((await repositories.chat.messages(HALL)).map((m) => m.body)).toEqual([
      'Romeo, wherefore art thou?',
      'anyone?',
      '> _ < see https://example.org/news',
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

  it('times out with ServerUnreachable when the room never answers', {
    timeout: 10_000,
  }, async () => {
    const error = await repositories.room
      .join({ jid: `silent@${SERVICE}`, nick: 'romeo' })
      .catch((e: unknown) => e);
    expect((error as DomainError).code).toBe('ServerUnreachable');
    // Unreachable is not a refusal: the model stays, so that its bookmark's autojoin applies.
    expect(
      (await repositories.room.list()).find((r) => r.jid === `silent@${SERVICE}`),
    ).toMatchObject({
      joined: false,
    });
    await repositories.room.leave(`silent@${SERVICE}`);
  });

  it('lists the rooms of a conference service', async () => {
    expect(await repositories.room.roomService(SERVICE)).toBe(SERVICE);
    const listed = await repositories.room.browse(SERVICE);
    expect(listed).toEqual([
      { jid: HALL, name: 'The Hall', membersCount: 2 },
      { jid: `cellar@${SERVICE}`, name: 'cellar' },
    ]);
    expect(await repositories.room.browse('nowhere.montague.lit')).toEqual([]);
    expect(await repositories.room.roomService('nowhere.montague.lit')).toBeNull();
  });

  it('joins a password-protected room without ever storing the password', async () => {
    const { stx, sizzle } = mock.converse.env;
    const vault = `vault@${SERVICE}`;
    known.add(vault);
    const conn = await harness.connection();
    const joining = repositories.room.join({ jid: vault, nick: 'romeo', password: 'open-sesame' });
    const first = await joinPresenceSent(vault);
    expect(sizzle('x password', first as Element)).toHaveLength(0);
    harness.inject(stx`<presence from="${vault}/romeo" to="${JID}/orchard" type="error" xmlns="jabber:client">
      <error type="auth"><not-authorized xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></presence>`);
    const second = await until(
      () =>
        conn.sent_stanzas.find(
          (s) => s !== first && s.nodeName === 'presence' && sizzle('x password', s).length > 0,
        ),
      'second join presence with the password',
    );
    expect(sizzle('x password', second as Element)[0]?.textContent).toBe('open-sesame');
    harness.inject(
      occupantPresence(
        vault,
        'romeo',
        ['110'],
        `<item affiliation="member" role="participant" jid="${JID}/orchard"/>`,
      ),
    );
    expect(await joining).toMatchObject({ jid: vault, joined: true });
    const muc = mock._converse.state.chatboxes.get(vault) as unknown as MucModel;
    expect(muc.get('password')).toBeUndefined();
    await until(() => rooms.some((r) => r.jid === vault && r.bookmarked), 'condition');
    const published = lastPublishedBookmark();
    expect(published?.parentElement?.getAttribute('id')).toBe(vault);
    expect(sizzle('password', published as Element)).toHaveLength(0);
    await repositories.room.leave(vault);
  });

  it('refuses a password-protected room without a password', async () => {
    const { stx } = mock.converse.env;
    const locked = `locked@${SERVICE}`;
    const joining = repositories.room.join({ jid: locked, nick: 'romeo' });
    await joinPresenceSent(locked);
    harness.inject(stx`<presence from="${locked}/romeo" to="${JID}/orchard" type="error" xmlns="jabber:client">
      <error type="auth"><not-authorized xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></presence>`);
    await expect(joining).rejects.toMatchObject({ code: 'RoomPasswordRequired' });
    expect((await repositories.room.list()).map((r) => r.jid)).not.toContain(locked);
  });

  it('maps a ban that arrives as a status code, without an error presence', async () => {
    const banned = `banned@${SERVICE}`;
    const joining = repositories.room.join({ jid: banned, nick: 'romeo' });
    await joinPresenceSent(banned);
    const { stx } = mock.converse.env;
    harness.inject(stx`<presence from="${banned}/romeo" to="${JID}/orchard" type="unavailable" xmlns="jabber:client">
      <x xmlns="http://jabber.org/protocol/muc#user"><item affiliation="outcast" role="none"/>
      <status code="301"/><status code="110"/></x></presence>`);
    await expect(joining).rejects.toMatchObject({ code: 'RoomBanned' });
  });

  it('removes and re-adds the bookmark while staying in the room', async () => {
    let before = rooms.length;
    await repositories.room.setBookmarked(HALL, false);
    expect(rooms.slice(before).at(-1)).toMatchObject({
      jid: HALL,
      joined: true,
      bookmarked: false,
    });
    expect((await repositories.room.list()).find((r) => r.jid === HALL)).toMatchObject({
      joined: true,
      bookmarked: false,
    });
    before = rooms.length;
    await repositories.room.setBookmarked(HALL, true);
    await until(() => rooms.slice(before).some((r) => r.jid === HALL && r.bookmarked), 'condition');
    expect((await repositories.room.list()).find((r) => r.jid === HALL)?.bookmarked).toBe(true);
  });

  it('removes the bookmark of a room we are not in, and puts it back when the server refuses', async () => {
    const cellar = `cellar@${SERVICE}`;
    await mock.api.bookmarks.set({ jid: cellar, autojoin: false, nick: 'romeo' });
    expect((await repositories.room.list()).find((r) => r.jid === cellar)).toMatchObject({
      joined: false,
      bookmarked: true,
    });
    refuseRetract = true;
    try {
      await expect(repositories.room.setBookmarked(cellar, false)).rejects.toMatchObject({
        code: 'Unknown',
      });
    } finally {
      refuseRetract = false;
    }
    expect((await repositories.room.list()).find((r) => r.jid === cellar)?.bookmarked).toBe(true);
    const before = rooms.length;
    await repositories.room.setBookmarked(cellar, false);
    expect(rooms.slice(before).at(-1)).toMatchObject({
      jid: cellar,
      joined: false,
      bookmarked: false,
    });
    expect((await repositories.room.list()).map((r) => r.jid)).not.toContain(cellar);
    // Not a model, still a room JID (a bookmark is added back for the open() check below).
    await mock.api.bookmarks.set({ jid: cellar, autojoin: false, nick: 'romeo' });
  });

  it('leaves the room and reports it as not joined', async () => {
    const conn = await harness.connection();
    const before = conn.sent_stanzas.length;
    await repositories.room.leave(HALL);
    // `leave()` does not await `api.user.presence.send` (`plugins/muc/muc.js:977`).
    const unavailable = await until(
      () =>
        conn.sent_stanzas
          .slice(before)
          .find((s) => s.nodeName === 'presence' && s.getAttribute('type') === 'unavailable'),
      'condition',
    );
    expect(unavailable?.getAttribute('to')).toBe(`${HALL}/romeo`);
    expect(rooms.at(-1)).toMatchObject({ jid: HALL, joined: false, unreadCount: 0 });
    // The bookmark stays (`leaveRoom` only turns its autojoin off).
    expect((await repositories.room.list()).find((r) => r.jid === HALL)).toMatchObject({
      joined: false,
      bookmarked: true,
    });
    expect((await repositories.chat.list()).map((c) => c.id)).not.toContain(HALL);
    await expect(repositories.room.members(HALL)).rejects.toMatchObject({ code: 'RoomNotFound' });
    // Not joined: opening it must not create a direct chat with the room's JID.
    await expect(repositories.chat.open(HALL)).rejects.toMatchObject({ code: 'RoomNotFound' });
    await expect(repositories.chat.open(`cellar@${SERVICE}`)).rejects.toMatchObject({
      code: 'RoomNotFound',
    });
  });
});
