// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { BookmarkModel, OccupantModel, RoomModel } from './models';
import { toRoom, toRoomInfo, toRoomMember } from './room-mappers';

const ENTERED = 5;
const context = { enteredStatus: ENTERED, notify: 'mentions' as const };

function model(attrs: Record<string, unknown>): BookmarkModel {
  return {
    get: (key) => attrs[key],
    save: () => undefined,
    set: () => undefined,
    on: () => undefined,
    off: () => undefined,
  };
}

/** `status` null: a room whose `setup()` has not restored its session yet. */
function room(attrs: Record<string, unknown>, status: number | null = ENTERED): RoomModel {
  return {
    ...model({ type: 'chatroom', ...attrs }),
    ...(status === null ? {} : { session: model({ connection_status: status }) }),
    notifications: model({}),
    occupants: {
      models: [],
      length: 0,
      get: () => undefined,
      on: () => undefined,
      off: () => undefined,
    },
    messages: {
      models: [],
      length: 0,
      get: () => undefined,
      on: () => undefined,
      off: () => undefined,
    },
    sendMessage: async () => undefined,
    retractOwnMessage: () => undefined,
    retractOtherMessage: async () => undefined,
    setSubject: () => undefined,
    getOccupant: () => undefined,
    setRole: () => undefined,
    sendDestroyIQ: async () => undefined,
    sendFiles: async () => undefined,
    onReconnection: async () => undefined,
    clearUnreadMsgCounter: () => undefined,
    getDisplayName: () => String(attrs.name ?? ''),
    isEntered: () => status === ENTERED,
    isUserMentioned: () => false,
    join: async () => undefined,
    close: async () => undefined,
  };
}

describe('toRoom', () => {
  const attrs = {
    jid: 'hall@rooms.example.org',
    name: 'The Hall',
    nick: 'romeo',
    subject: { author: 'juliet', text: 'Welcome' },
    num_unread: 1,
    num_unread_general: 4,
  };

  it('maps a joined room with its counters and topic', () => {
    expect(toRoom(room(attrs), undefined, context)).toEqual({
      jid: 'hall@rooms.example.org',
      name: 'The Hall',
      nick: 'romeo',
      joined: true,
      bookmarked: false,
      topic: 'Welcome',
      notify: 'mentions',
      unreadCount: 4,
      mentionsCount: 1,
    });
  });

  it('is not joined in any other status, and bookmarked when a bookmark exists', () => {
    const bookmark = model({ jid: attrs.jid, name: 'Bookmarked name', nick: 'r' });
    const mapped = toRoom(room(attrs, 4), bookmark, { ...context, notify: 'all' });
    expect(mapped).toMatchObject({
      joined: false,
      bookmarked: true,
      name: 'The Hall',
      notify: 'all',
    });
  });

  it('maps a bookmark alone, falling back to the local part for the name', () => {
    const bookmark = model({ jid: 'cellar@rooms.example.org', nick: 'r' });
    expect(toRoom(undefined, bookmark, context)).toEqual({
      jid: 'cellar@rooms.example.org',
      name: 'cellar',
      nick: 'r',
      joined: false,
      bookmarked: true,
      notify: 'mentions',
      unreadCount: 0,
      mentionsCount: 0,
    });
  });

  it('tolerates a room whose session is not restored yet', () => {
    expect(toRoom(room(attrs, null), undefined, context).joined).toBe(false);
  });
});

describe('toRoomMember', () => {
  const occupant = (attrs: Record<string, unknown>): OccupantModel => ({
    ...model(attrs),
    getDisplayName: () => String(attrs.nick),
  });

  it('maps the nick, role, affiliation and bare JID', () => {
    const member = toRoomMember(
      occupant({
        nick: 'juliet',
        role: 'moderator',
        affiliation: 'admin',
        jid: 'juliet@example.org/x',
      }),
    );
    expect(member).toEqual({
      nick: 'juliet',
      role: 'moderator',
      affiliation: 'admin',
      jid: 'juliet@example.org',
    });
  });

  it('omits the JID of anonymous occupants and defaults unknown values', () => {
    expect(toRoomMember(occupant({ nick: 'x', role: 'weird', affiliation: null }))).toEqual({
      nick: 'x',
      role: 'participant',
      affiliation: 'none',
    });
  });
});

describe('toRoomInfo', () => {
  const xml = (text: string) =>
    new DOMParser().parseFromString(text, 'text/xml').documentElement as Element;

  it('takes the name from the item, then the identity, then the local part', () => {
    const item = xml(
      '<item xmlns="http://jabber.org/protocol/disco#items" jid="a@rooms.example.org"/>',
    );
    expect(toRoomInfo(item)).toEqual({ jid: 'a@rooms.example.org', name: 'a' });
    const info = xml(`<query xmlns="http://jabber.org/protocol/disco#info">
      <identity category="conference" type="text" name="Room A"/>
      <x xmlns="jabber:x:data"><field var="muc#roominfo_occupants"><value>7</value></field>
      <field var="muc#roominfo_description"><value>Chit-chat</value></field></x></query>`);
    expect(toRoomInfo(item, info)).toEqual({
      jid: 'a@rooms.example.org',
      name: 'Room A',
      membersCount: 7,
      description: 'Chit-chat',
    });
    const named = xml(
      '<item xmlns="http://jabber.org/protocol/disco#items" jid="a@rooms.example.org" name="Listed"/>',
    );
    expect(toRoomInfo(named, info).name).toBe('Listed');
  });

  it('ignores an unreadable occupant count', () => {
    const item = xml('<item jid="a@rooms.example.org"/>');
    const info = xml(
      '<query><x><field var="muc#roominfo_occupants"><value>many</value></field></x></query>',
    );
    expect(toRoomInfo(item, info)).toEqual({ jid: 'a@rooms.example.org', name: 'a' });
  });
});
