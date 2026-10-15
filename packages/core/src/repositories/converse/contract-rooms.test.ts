// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DomainError } from '../../contracts/errors';
import type { Chat, Message, Room, RoomMember } from '../../contracts/types';
import { createConverseRepositories } from './index';
import {
  type BobClient,
  connectBob,
  isGroupchatMessageFrom,
  isPresenceFrom,
} from './test-support/bobClient';
import { prepareContractEnvironment, until } from './test-support/contractEnv';

/**
 * Rooms against the real XMPP server (tools/xmpp-server, MUC component `rooms.localhost`):
 * alice joins through the repositories, bob through the hand-written client. Same conventions
 * as contract.test.ts: skipped without `XMPP_TEST_SERVER`, one engine, cases in order. Findings
 * are in wiki/development/converse.md, "Rooms (MUC)".
 */

const { SERVER, TIMEOUT } = await prepareContractEnvironment();
const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
const SERVICE = 'rooms.localhost';
/** Rooms are not persistent, but names carry the run token like every other fixture. */
const RUN = Date.now().toString(36);
const HALL = `hall-${RUN}@${SERVICE}`;

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  connectTimeoutMs: 8_000,
  joinTimeoutMs: 8_000,
});
const rooms: Room[] = [];
const members: Array<[string, RoomMember[]]> = [];
const received: Message[] = [];
const chats: Chat[] = [];
repositories.room.onChange((room) => rooms.push(room));
repositories.room.onMembersChange((jid, list) => members.push([jid, list]));
repositories.chat.onMessage((message) => received.push(message));
repositories.chat.onChatChange((chat) => chats.push(chat));

let bob: BobClient;

describe.skipIf(!SERVER)('Converse room repository against the XMPP test server', () => {
  beforeAll(async () => {
    bob = await connectBob({ url: SERVER ?? '', jid: BOB, password: 'bob-pw' });
    await repositories.xmpp.connect({
      jid: ALICE,
      password: 'alice-pw',
      websocketUrl: SERVER ?? '',
    });
  }, TIMEOUT);

  afterAll(async () => {
    bob.leaveRoom(HALL, 'bob');
    await bob.close();
    // A bookmark left behind would make Converse rejoin the room at every later sign-in.
    await repositories.room.setBookmarked(HALL, false).catch(() => undefined);
    await repositories.xmpp.disconnect().catch(() => undefined);
  }, TIMEOUT);

  it(
    '1. creates and joins a room, which the server bookmarks through Converse',
    async () => {
      const room = await repositories.room.join({ jid: HALL, nick: 'alice' });
      expect(room).toMatchObject({ jid: HALL, nick: 'alice', joined: true, notify: 'mentions' });
      expect(room.name).toBe(`hall-${RUN}`);
      const listed = await repositories.room.list();
      expect(listed.find((r) => r.jid === HALL)).toMatchObject({ joined: true });
      // `enteredNewRoom` makes Converse bookmark every room it enters, autojoin on.
      await until(() => rooms.some((r) => r.jid === HALL && r.bookmarked), 'bookmarked');
      const chat = (await repositories.chat.list()).find((c) => c.id === HALL);
      expect(chat).toMatchObject({ kind: 'room', title: `hall-${RUN}`, unreadCount: 0 });
    },
    TIMEOUT,
  );

  it(
    '2. sees bob join, lists both members with their roles',
    async () => {
      await bob.joinRoom(HALL, 'bob');
      await until(
        () => members.some(([jid, list]) => jid === HALL && list.some((m) => m.nick === 'bob')),
        'onMembersChange with bob',
      );
      const listed = await repositories.room.members(HALL);
      expect(listed.sort((a, b) => a.nick.localeCompare(b.nick))).toEqual([
        { nick: 'alice', jid: ALICE, role: 'moderator', affiliation: 'owner' },
        { nick: 'bob', jid: BOB, role: 'participant', affiliation: 'none' },
      ]);
    },
    TIMEOUT,
  );

  it(
    '3. receives a mention from bob as a room message, counted as unread and mention',
    async () => {
      bob.send(
        `<message to="${HALL}" type="groupchat" id="${RUN}-m1"><body>Alice, are you there?</body></message>`,
      );
      const message = await until(() => received.find((m) => m.chatId === HALL), 'onMessage');
      expect(message).toMatchObject({
        chatId: HALL,
        fromJid: BOB,
        fromNick: 'bob',
        body: 'Alice, are you there?',
        direction: 'in',
        isMention: true,
        encryption: 'none',
      });
      await until(
        () => rooms.some((r) => r.jid === HALL && r.unreadCount === 1 && r.mentionsCount === 1),
        'room counters',
      );
      expect(chats.filter((c) => c.id === HALL).at(-1)?.unreadCount).toBe(1);
    },
    TIMEOUT,
  );

  it(
    '4. answers in the room, bob receives it, and markRead clears the counters',
    async () => {
      bob.forget();
      const sent = await repositories.chat.send(HALL, 'here I am');
      expect(sent).toMatchObject({ chatId: HALL, direction: 'out', fromNick: 'alice' });
      const stanza = await bob.waitFor(isGroupchatMessageFrom(HALL));
      expect(stanza.getAttribute('from')).toBe(`${HALL}/alice`);
      expect(stanza.getElementsByTagName('body')[0]?.textContent).toBe('here I am');
      expect(received.find((m) => m.id === sent.id)).toBeUndefined();

      await repositories.chat.markRead(HALL);
      await until(
        () => rooms.some((r) => r.jid === HALL && r.unreadCount === 0 && r.mentionsCount === 0),
        'counters cleared',
      );
      const messages = await repositories.chat.messages(HALL);
      expect(messages.map((m) => m.body)).toEqual(['Alice, are you there?', 'here I am']);
    },
    TIMEOUT,
  );

  it(
    '5. browses the conference service, and finds it from the account domain',
    async () => {
      // Prosody hides new rooms from the list by default: bob opens one and makes it public.
      const lobby = `lobby-${RUN}@${SERVICE}`;
      await bob.joinRoom(lobby, 'bob');
      bob.send(`<iq type="set" to="${lobby}" id="${RUN}-config"><query xmlns="http://jabber.org/protocol/muc#owner">
        <x xmlns="jabber:x:data" type="submit">
          <field var="FORM_TYPE"><value>http://jabber.org/protocol/muc#roomconfig</value></field>
          <field var="muc#roomconfig_publicroom"><value>1</value></field>
          <field var="muc#roomconfig_roomname"><value>The Lobby</value></field>
        </x></query></iq>`);
      const configured = await bob.waitFor(
        (st) => st.localName === 'iq' && st.getAttribute('id') === `${RUN}-config`,
      );
      expect(configured.getAttribute('type')).toBe('result');

      const listed = await repositories.room.browse(SERVICE);
      expect(listed.find((r) => r.jid === lobby)).toMatchObject({
        name: 'The Lobby',
        membersCount: 1,
      });
      const fromDomain = await repositories.room.browse('localhost');
      expect(fromDomain.map((r) => r.jid)).toContain(lobby);
      bob.leaveRoom(lobby, 'bob');
    },
    TIMEOUT,
  );

  it(
    '6. keeps the room joined when the bookmark is removed, bookmarks it again, stores the rule',
    async () => {
      await repositories.room.setBookmarked(HALL, false);
      let room = (await repositories.room.list()).find((r) => r.jid === HALL);
      expect(room).toMatchObject({ joined: true, bookmarked: false });
      await repositories.room.setBookmarked(HALL, true);
      await until(() => rooms.some((r) => r.jid === HALL && r.bookmarked), 'bookmarked again');
      await repositories.room.setNotify(HALL, 'all');
      room = (await repositories.room.list()).find((r) => r.jid === HALL);
      expect(room).toMatchObject({ joined: true, bookmarked: true, notify: 'all' });
    },
    TIMEOUT,
  );

  it(
    '7. refuses a nick that bob holds with NickTaken',
    async () => {
      const error = await repositories.room.join({ jid: HALL, nick: 'bob' }).then(
        () => null,
        (e: unknown) => e as DomainError,
      );
      // Already in the room as alice: Converse answers from its own model without a presence...
      // so the attempt is made on a second room where bob holds the nick first.
      const other = `annex-${RUN}@${SERVICE}`;
      await bob.joinRoom(other, 'bob');
      const refused = await repositories.room.join({ jid: other, nick: 'bob' }).then(
        () => null,
        (e: unknown) => e as DomainError,
      );
      expect(refused?.code, refused?.message).toBe('NickTaken');
      expect((await repositories.room.list()).map((r) => r.jid)).not.toContain(other);
      bob.leaveRoom(other, 'bob');
      expect(error).toBeNull();
    },
    TIMEOUT,
  );

  it(
    '8. leaves: bob sees alice go, the room stays listed as a bookmark that is not joined',
    async () => {
      bob.forget();
      await repositories.room.leave(HALL);
      await bob.waitFor(isPresenceFrom(HALL, 'unavailable'));
      expect(rooms.at(-1)).toMatchObject({ jid: HALL, joined: false });
      const room = (await repositories.room.list()).find((r) => r.jid === HALL);
      expect(room).toMatchObject({ joined: false, bookmarked: true, notify: 'all' });
      expect((await repositories.chat.list()).map((c) => c.id)).not.toContain(HALL);
      await repositories.room.setBookmarked(HALL, false);
      expect((await repositories.room.list()).map((r) => r.jid)).not.toContain(HALL);
    },
    TIMEOUT,
  );
});
