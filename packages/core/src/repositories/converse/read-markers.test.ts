// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Message } from '../../contracts/types';
import { createConverseRepositories } from './index';
import type { ChatModel, MessageModel } from './models';
import { addMarkerType, applyReadMarker, chatMarker, isRead, READ_UNTIL } from './read-markers';
import { JID, JULIET, MockHarness } from './test-support/mockConverse';

const NS = 'urn:xmpp:chat-markers:0';

function xml(text: string): Element {
  const element = new DOMParser().parseFromString(text, 'application/xml').documentElement;
  if (!element) throw new Error('bad xml');
  return element;
}

function model(attrs: Record<string, unknown>): MessageModel {
  return {
    get: (key) => attrs[key],
    save: (changes) => Object.assign(attrs, changes),
    set: () => undefined,
    on: () => undefined,
    off: () => undefined,
  };
}

function chat(messages: MessageModel[], attrs: Record<string, unknown> = {}): ChatModel {
  return { ...model(attrs), messages: { models: messages } } as unknown as ChatModel;
}

describe('chatMarker', () => {
  it('reads the type and id of a marker child, the highest when there are two', () => {
    expect(chatMarker(xml(`<message><displayed xmlns="${NS}" id="m1"/></message>`))).toEqual({
      type: 'displayed',
      id: 'm1',
    });
    const both = `<message><received xmlns="${NS}" id="a"/><displayed xmlns="${NS}" id="b"/></message>`;
    expect(chatMarker(xml(both))).toEqual({ type: 'displayed', id: 'b' });
  });

  it('finds the marker in an OMEMO payload, never in a forwarded stanza or another namespace', () => {
    const content = `<content xmlns="urn:xmpp:sce:1"><payload><displayed xmlns="${NS}" id="m2"/></payload></content>`;
    expect(chatMarker(xml(content))).toEqual({ type: 'displayed', id: 'm2' });
    const forwarded = `<message><forwarded xmlns="urn:xmpp:forward:0"><message><displayed xmlns="${NS}" id="x"/></message></forwarded></message>`;
    expect(chatMarker(xml(forwarded))).toBeNull();
    expect(chatMarker(xml('<message><displayed xmlns="other" id="x"/></message>'))).toBeNull();
    expect(chatMarker(xml(`<message><displayed xmlns="${NS}"/></message>`))).toBeNull();
  });
});

describe('addMarkerType', () => {
  it('adds the type to the attributes in place and lets errors through', () => {
    const attrs = { marker_id: 'm1' };
    const stanza = xml(`<message><acknowledged xmlns="${NS}" id="m1"/></message>`);
    expect(addMarkerType(stanza, attrs)).toBe(attrs);
    expect(attrs).toEqual({ marker_id: 'm1', marker_type: 'acknowledged' });
    const error = new Error('parse');
    expect(addMarkerType(stanza, error)).toBe(error);
    expect(addMarkerType('not an element', attrs)).toBe(attrs);
  });
});

describe('applyReadMarker', () => {
  const ours = (id: string, time: string) => model({ msgid: id, sender: 'me', time });
  const marker = (id: string, extra: Record<string, unknown> = {}) => ({
    marker_type: 'displayed',
    marker_id: id,
    sender: 'them',
    ...extra,
  });

  it('reads the letter pointed at and every earlier one of ours, never backwards', () => {
    const a = ours('a', '2026-10-17T10:00:00.000Z');
    const theirs = model({ msgid: 't', sender: 'them', time: '2026-10-17T10:00:30.000Z' });
    const b = ours('b', '2026-10-17T10:01:00.000Z');
    const c = ours('c', '2026-10-17T10:02:00.000Z');
    const target = chat([a, theirs, b, c]);
    expect(applyReadMarker(target, marker('b'))).toEqual([a, b]);
    expect(target.get(READ_UNTIL)).toBe('2026-10-17T10:01:00.000Z');
    expect(applyReadMarker(target, marker('a'))).toEqual([]);
    expect(target.get(READ_UNTIL)).toBe('2026-10-17T10:01:00.000Z');
    expect(applyReadMarker(target, marker('c'))).toEqual([c]);
  });

  it('ignores a received marker, our own device’s marker, an archived one and an unknown id', () => {
    const target = chat([ours('a', '2026-10-17T10:00:00.000Z')]);
    expect(applyReadMarker(target, marker('a', { marker_type: 'received' }))).toEqual([]);
    expect(applyReadMarker(target, marker('a', { sender: 'me' }))).toEqual([]);
    expect(applyReadMarker(target, marker('a', { is_archived: true }))).toEqual([]);
    expect(applyReadMarker(target, marker('nope'))).toEqual([]);
    expect(target.get(READ_UNTIL)).toBeUndefined();
  });
});

describe('isRead', () => {
  it('compares times, and says no when either is missing', () => {
    expect(isRead('2026-10-17T10:00:00.000Z', '2026-10-17T10:00:00.000Z')).toBe(true);
    expect(isRead('2026-10-17T10:00:01.000Z', '2026-10-17T10:00:00.000Z')).toBe(false);
    expect(isRead('2026-10-17T10:00:00.000Z', undefined)).toBe(false);
  });
});

describe('ConverseChatRepository read markers (mock connection)', () => {
  const repositories = createConverseRepositories({
    persistentStore: 'localStorage',
    mockConnection: true,
    connectTimeoutMs: 300,
  });
  const updated: Message[] = [];
  repositories.chat.onMessageUpdate((message) => updated.push(message));
  let harness: MockHarness;

  beforeAll(async () => {
    harness = await MockHarness.create(repositories);
    await harness.connectAndLoadRoster();
  });

  it('makes our letters read up to the one a displayed marker points at', async () => {
    const { stx, u } = harness.env;
    await repositories.chat.open(JULIET);
    const sent: Message[] = [];
    for (const body of ['one', 'two', 'three']) {
      sent.push(await repositories.chat.send(JULIET, body));
      // Distinct times: the read line is a time.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const [one, two, three] = sent as [Message, Message, Message];
    harness.inject(stx`<message from="${JULIET}/balcony" to="${JID}/orchard" type="chat" id="r1" xmlns="jabber:client">
        <received xmlns="${NS}" id="${three.id}"/></message>`);
    harness.inject(stx`<message from="${JULIET}/balcony" to="${JID}/orchard" type="chat" id="d1" xmlns="jabber:client">
        <displayed xmlns="${NS}" id="${two.id}"/></message>`);
    await u.waitUntil(() => updated.some((m) => m.id === two.id && m.status === 'read'));
    expect(updated.filter((m) => m.status === 'read').map((m) => m.body)).toEqual(['one', 'two']);
    const statuses = (await repositories.chat.messages(JULIET)).map((m) => [m.body, m.status]);
    expect(statuses).toEqual([
      ['one', 'read'],
      ['two', 'read'],
      ['three', 'sent'],
    ]);
    expect(one.status).toBe('sent');
  });

  it('stops sending displayed markers when told, and keeps delivery receipts', () => {
    const settings = (harness.mock.api as unknown as { settings: { get(key: string): unknown } })
      .settings;
    expect(settings.get('send_chat_markers')).toEqual(['received', 'displayed', 'acknowledged']);
    repositories.chat.setSendReadMarkers(false);
    expect(settings.get('send_chat_markers')).toEqual(['received']);
    repositories.chat.setSendReadMarkers(true);
    expect(settings.get('send_chat_markers')).toEqual(['received', 'displayed', 'acknowledged']);
  });
});
