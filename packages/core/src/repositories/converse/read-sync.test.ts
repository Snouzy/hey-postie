// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ConverseEngine } from './engine';
import type { ChatModel, MessageModel } from './models';
import {
  applyDisplayed,
  ConverseReadSync,
  DISPLAYED_AT,
  displayedItems,
  MDS_NODE,
  newestStamped,
  parseDisplayed,
} from './read-sync';

const SELF = 'alice@localhost';
const BOB = 'bob@localhost';
const HALL = 'hall@rooms.localhost';
const SID = 'urn:xmpp:sid:0';
const EVENT = 'http://jabber.org/protocol/pubsub#event';

function xml(text: string): Element {
  const element = new DOMParser().parseFromString(text, 'application/xml').documentElement;
  if (!element) throw new Error('bad xml');
  return element;
}

function item(chatJid: string, id: string, by: string): string {
  return `<item id="${chatJid}"><displayed xmlns="${MDS_NODE}"><stanza-id xmlns="${SID}" id="${id}" by="${by}"/></displayed></item>`;
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

/** A letter at minute `minute`, stamped `s<minute>` by `by`. */
function letter(minute: number, sender: 'me' | 'them', by = SELF): MessageModel {
  return model({
    time: new Date(Date.UTC(2026, 9, 16, 10, minute)).toISOString(),
    sender,
    body: `letter ${minute}`,
    [`stanza_id ${by}`]: `s${minute}`,
  });
}

function chat(messages: MessageModel[], attrs: Record<string, unknown>): ChatModel {
  return { ...model(attrs), messages: { models: messages } } as unknown as ChatModel;
}

const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 10, minute)).toISOString();

describe('parseDisplayed and displayedItems', () => {
  it('reads the chat and the stanza id of an item', () => {
    expect(parseDisplayed(xml(item('Bob@Localhost', 's1', SELF)))).toEqual({
      chatJid: BOB,
      stanzaId: 's1',
      by: SELF,
    });
    expect(parseDisplayed(xml(`<item id="${BOB}"><displayed xmlns="${MDS_NODE}"/></item>`))).toBe(
      null,
    );
  });

  it('reads the items of a PEP event for our node only', () => {
    const event = (node: string) =>
      xml(
        `<message from="${SELF}" type="headline"><event xmlns="${EVENT}"><items node="${node}">${item(BOB, 's1', SELF)}${item(HALL, 'h1', HALL)}</items></event></message>`,
      );
    expect(displayedItems(event(MDS_NODE)).map((d) => d.chatJid)).toEqual([BOB, HALL]);
    expect(displayedItems(event('urn:xmpp:bookmarks:1'))).toEqual([]);
  });
});

describe('applyDisplayed', () => {
  it('drops the unread count to the incoming letters after the displayed one', () => {
    const direct = chat([letter(1, 'them'), letter(2, 'them'), letter(3, 'them')], {
      type: 'chatbox',
      num_unread: 3,
    });
    expect(applyDisplayed(direct, { chatJid: BOB, stanzaId: 's2', by: SELF }, SELF)).toBe(
      'applied',
    );
    expect(direct.get('num_unread')).toBe(1);
    expect(direct.get(DISPLAYED_AT)).toBe(at(2));
  });

  it('never moves the position backwards, nor raises the count', () => {
    const direct = chat([letter(1, 'them'), letter(2, 'me')], {
      type: 'chatbox',
      num_unread: 0,
      [DISPLAYED_AT]: at(2),
    });
    expect(applyDisplayed(direct, { chatJid: BOB, stanzaId: 's1', by: SELF }, SELF)).toBe(
      'ignored',
    );
    expect(direct.get(DISPLAYED_AT)).toBe(at(2));
    const fresh = chat([letter(1, 'them'), letter(2, 'them')], { type: 'chatbox', num_unread: 0 });
    applyDisplayed(fresh, { chatJid: BOB, stanzaId: 's1', by: SELF }, SELF);
    expect(fresh.get('num_unread')).toBe(0);
  });

  it('waits for a letter it does not hold, and ignores another archive', () => {
    const direct = chat([letter(1, 'them')], { type: 'chatbox', num_unread: 1 });
    expect(applyDisplayed(direct, { chatJid: BOB, stanzaId: 's9', by: SELF }, SELF)).toBe(
      'pending',
    );
    expect(applyDisplayed(direct, { chatJid: BOB, stanzaId: 's1', by: BOB }, SELF)).toBe('ignored');
    expect(direct.get('num_unread')).toBe(1);
  });

  it('in a hall, clears the general count, the mentions and the activity flag', () => {
    const hall = chat([letter(1, 'them', HALL), letter(2, 'them', HALL)], {
      type: 'chatroom',
      jid: HALL,
      num_unread_general: 2,
      num_unread: 1,
      has_activity: true,
    });
    expect(applyDisplayed(hall, { chatJid: HALL, stanzaId: 's2', by: HALL }, SELF)).toBe('applied');
    expect(hall.get('num_unread_general')).toBe(0);
    expect(hall.get('num_unread')).toBe(0);
    expect(hall.get('has_activity')).toBe(false);
  });
});

describe('ConverseReadSync.publish', () => {
  function setup() {
    const publish = vi.fn(async () => undefined);
    const stx = (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((out, part, index) => out + part + (values[index] ?? ''), '');
    const engine = {
      current: {
        api: { pubsub: { publish } },
        env: { stx },
        state: { session: model({ bare_jid: SELF }) },
      },
      on: () => () => undefined,
      onReady: () => undefined,
    } as unknown as ConverseEngine;
    return { publish, sync: new ConverseReadSync(engine) };
  }

  it('publishes the newest stamped letter, with XEP-0490 options, once', async () => {
    const { publish, sync } = setup();
    const unstamped = model({ time: at(5), sender: 'me', body: 'mine' });
    const direct = chat([letter(1, 'them'), letter(2, 'them'), unstamped], {
      type: 'chatbox',
      jid: BOB,
    });
    expect(newestStamped(direct, SELF)?.get('time')).toBe(at(2));
    await sync.publish(direct);
    expect(publish).toHaveBeenCalledWith(
      SELF,
      MDS_NODE,
      `<item id="${BOB}"><displayed xmlns="${MDS_NODE}"><stanza-id xmlns="${SID}" id="s2" by="${SELF}"/></displayed></item>`,
      {
        persist_items: 'true',
        max_items: 'max',
        send_last_published_item: 'never',
        access_model: 'whitelist',
      },
      true,
    );
    expect(direct.get(DISPLAYED_AT)).toBe(at(2));
    await sync.publish(direct);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('publishes nothing without a stamped letter; in a hall the room stamps', async () => {
    const { publish, sync } = setup();
    await sync.publish(chat([model({ time: at(1), sender: 'them' })], { type: 'chatbox' }));
    expect(publish).not.toHaveBeenCalled();
    await sync.publish(chat([letter(1, 'them', HALL)], { type: 'chatroom', jid: HALL }));
    expect(publish).toHaveBeenCalledWith(
      SELF,
      MDS_NODE,
      expect.stringContaining(`id="s1" by="${HALL}"`),
      expect.anything(),
      true,
    );
  });
});
