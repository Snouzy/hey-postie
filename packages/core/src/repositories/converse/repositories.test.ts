// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '../../contracts/errors';
import type { AccountState, Chat, Contact, Message } from '../../contracts/types';
import { createConverseRepositories } from './index';

/**
 * Drives the real `@converse/headless` over its `MockConnection` (wiki/development/converse.md
 * §11): no socket, stanzas injected with `_dataRecv`, IQs answered by hand. The test file owns
 * one Converse instance; the cases run in order and share it.
 */

interface Mock {
  api: {
    connection: { get(): MockConnection | undefined };
    listen: {
      on(name: string, handler: (...args: never[]) => void): void;
      once(name: string, handler: (...args: never[]) => void): void;
    };
    user: { logout(): Promise<void>; settings: { clear(): Promise<unknown> } };
    waitUntil(name: string): Promise<unknown> | null;
  };
  _converse: {
    state: { chatboxes: { get(jid: string): { get(key: string): unknown } | undefined } };
  };
  converse: {
    env: {
      Strophe: {
        Status: Record<string, number>;
        NS: { ROSTER: string; DISCO_INFO: string; MAM: string };
        Bosh: { prototype: { _onClose?: (event: { code: number; reason: string }) => void } };
        Request: new (stanza: Element, callback: () => void) => { getResponse(): Element };
        Builder: new (name: string, attrs: Record<string, string>) => { tree(): Element };
      };
      stx: (strings: TemplateStringsArray, ...values: unknown[]) => { tree(): Element };
      sizzle: (selector: string, element: Element) => Element[];
      u: { waitUntil<T>(condition: () => T): Promise<T> };
    };
  };
}

interface MockConnection {
  jid: string;
  connected: boolean;
  IQ_stanzas: Element[];
  sent_stanzas: Element[];
  _proto: {
    _connect: () => void;
    _onClose: (event: { code: number; reason: string }) => void;
  };
  _changeConnectStatus(status: number, condition?: string): void;
  _dataRecv(request: unknown): void;
}

const JID = 'romeo@montague.lit';
const JULIET = 'juliet@montague.lit';
const MERCUTIO = 'mercutio@montague.lit';
const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  mockConnection: true,
  connectTimeoutMs: 300,
});
const states: Array<[AccountState, string | undefined]> = [];
const received: Message[] = [];
const updated: Message[] = [];
const chats: Chat[] = [];
const contacts: Contact[] = [];
repositories.xmpp.onStateChange((state, error) => states.push([state, error?.code]));
repositories.chat.onMessage((message) => received.push(message));
repositories.chat.onMessageUpdate((message) => updated.push(message));
repositories.chat.onChatChange((chat) => chats.push(chat));
repositories.roster.onChange((contact) => contacts.push(contact));

let mock: Mock;

beforeAll(async () => {
  // Same module instance as the engine's lazy import: the singleton is shared.
  mock = (await import('@converse/headless')) as unknown as Mock;
  window.fetch = () => Promise.reject(new Error('no network in tests'));
  // `converse.initialize` drops every listener: initialize (a no-op sign-out) before hooking events.
  await repositories.xmpp.disconnect();
  // Test-env only: `isTestEnv()` makes every disconnect clear the cache, and the logout cascade
  // runs `clearUserSettings` concurrently, which races on its module variable (converse.md §12).
  const clear = mock.api.user.settings.clear.bind(mock.api.user.settings);
  mock.api.user.settings.clear = () => clear().catch(() => undefined);
  // The mock transport is BOSH, which has no `_onClose`: this stub stands in for Strophe's WebSocket
  // one, so that the repository can wrap it. The real close path is not reachable without a socket.
  mock.converse.env.Strophe.Bosh.prototype._onClose = () => undefined;
});

async function connection(): Promise<MockConnection> {
  return mock.converse.env.u.waitUntil(() => mock.api.connection.get() as MockConnection);
}

function inject(stanza: { tree(): Element }): void {
  const { Strophe } = mock.converse.env;
  const connection = mock.api.connection.get();
  if (!connection) throw new Error('no connection');
  const tree = stanza.tree();
  const request = new Strophe.Request(tree, () => undefined);
  request.getResponse = () => {
    const envelope = new Strophe.Builder('env', { type: 'mock' }).tree();
    envelope.appendChild(tree);
    return envelope;
  };
  connection._dataRecv(request);
}

/** Answers the roster IQ with two contacts, which lets `rosterContactsFetched` fire. */
async function answerRoster(): Promise<void> {
  const { u, sizzle, stx, Strophe } = mock.converse.env;
  const conn = await connection();
  const selector = `iq[type="get"] query[xmlns="${Strophe.NS.ROSTER}"]`;
  const iq = await u.waitUntil(() =>
    conn.IQ_stanzas.filter((stanza) => sizzle(selector, stanza).length).pop(),
  );
  inject(stx`<iq to="${conn.jid}" type="result" id="${iq?.getAttribute('id')}" xmlns="jabber:client">
      <query xmlns="jabber:iq:roster">
        <item jid="${JULIET}" name="Juliet" subscription="both"/>
        <item jid="${MERCUTIO}" subscription="to"/>
      </query>
    </iq>`);
}

/** Patches the next connection so that connecting ends in the given Strophe status. */
function failNextConnectionWith(outcome: (connection: MockConnection) => void): void {
  mock.api.listen.once('connectionInitialized', () => {
    const connection = mock.api.connection.get();
    if (connection) connection._proto._connect = () => outcome(connection);
  });
}

/** Simulates the relay closing the WebSocket before the stream opened (see `beforeAll`). */
function closeNextSocketWith(code: number, reason: string): void {
  failNextConnectionWith((connection) => connection._proto._onClose({ code, reason }));
}

function nextEvent(name: string): Promise<void> {
  return new Promise((resolve) => mock.api.listen.once(name, () => resolve()));
}

async function connectAndLoadRoster(password = 'secret'): Promise<void> {
  const connecting = repositories.xmpp.connect({ jid: JID, password, websocketUrl: '' });
  await answerRoster();
  await connecting;
}

describe('ConverseXmppRepository', () => {
  it('rejects with InvalidCredentials on AUTHFAIL', async () => {
    const { Status } = mock.converse.env.Strophe;
    failNextConnectionWith((connection) =>
      connection._changeConnectStatus(Status.AUTHFAIL ?? 4, 'not-authorized'),
    );
    const error = await repositories.xmpp
      .connect({ jid: JID, password: 'wrong', websocketUrl: '' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('InvalidCredentials');
    expect((error as DomainError).message.startsWith('InvalidCredentials')).toBe(true);
  });

  it('rejects with CertificateInvalid when the relay closes the socket with that reason', async () => {
    closeNextSocketWith(1008, 'CertificateInvalid');
    const error = await repositories.xmpp
      .connect({ jid: JID, password: 'secret', websocketUrl: '' })
      .catch((e: unknown) => e);
    expect((error as DomainError).code, (error as DomainError).message).toBe('CertificateInvalid');
  });

  it('rejects with ServerUnreachable on a clean close without reason, and on timeout', async () => {
    closeNextSocketWith(1000, '');
    const closed = await repositories.xmpp
      .connect({ jid: JID, password: 'secret', websocketUrl: '' })
      .catch((e: unknown) => e);
    expect((closed as DomainError).code).toBe('ServerUnreachable');

    failNextConnectionWith(() => undefined);
    const timedOut = await repositories.xmpp
      .connect({ jid: JID, password: 'secret', websocketUrl: '' })
      .catch((e: unknown) => e);
    expect((timedOut as DomainError).code).toBe('ServerUnreachable');
    expect(states).toEqual([]);
  });

  it('connects once the roster and the chats are loaded', async () => {
    await connectAndLoadRoster();
    expect(states).toEqual([['online', undefined]]);
  });
});

describe('ConverseRosterRepository', () => {
  it('lists the contacts with their presence', async () => {
    const listed = await repositories.roster.list();
    expect(listed.sort((a, b) => a.jid.localeCompare(b.jid))).toEqual([
      { jid: JULIET, name: 'Juliet', presence: 'offline', subscription: 'both' },
      { jid: MERCUTIO, name: 'mercutio', presence: 'offline', subscription: 'to' },
    ]);
  });

  it('reports presence changes', async () => {
    const { stx } = mock.converse.env;
    inject(
      stx`<presence from="${JULIET}/balcony" xmlns="jabber:client"><show>away</show></presence>`,
    );
    await mock.converse.env.u.waitUntil(() => contacts.some((c) => c.presence === 'away'));
    expect(contacts.at(-1)).toMatchObject({ jid: JULIET, presence: 'away' });
  });
});

describe('ConverseChatRepository', () => {
  it('creates the chat and emits the chat change then the message on an incoming stanza', async () => {
    const { stx } = mock.converse.env;
    inject(stx`<message from="${JULIET}/balcony" to="${JID}/orchard" type="chat" id="m1" xmlns="jabber:client">
        <body>hello</body>
      </message>`);
    await mock.converse.env.u.waitUntil(() => received.length > 0);
    expect(received[0]).toMatchObject({
      chatId: JULIET,
      fromJid: JULIET,
      body: 'hello',
      direction: 'in',
      encryption: 'none',
    });
    expect(chats.at(-1)?.lastMessage?.body).toBe('hello');
    const listed = await repositories.chat.list();
    expect(listed.map((c) => c.id)).toEqual([JULIET]);
    expect(listed[0]?.title).toBe('Juliet');
  });

  it('returns the loaded messages, oldest first', async () => {
    const messages = await repositories.chat.messages(JULIET);
    expect(messages.map((m) => m.body)).toEqual(['hello']);
    expect(await repositories.chat.messages(JULIET, { before: 'nothing' })).toEqual([]);
  });

  it('sends a message, sent until the receipt arrives', async () => {
    const { stx } = mock.converse.env;
    const sent = await repositories.chat.send(JULIET, 'hi back');
    expect(sent).toMatchObject({
      chatId: JULIET,
      direction: 'out',
      status: 'sent',
      body: 'hi back',
    });
    expect(received.map((m) => m.body)).toEqual(['hello']);
    inject(stx`<message from="${JULIET}/balcony" to="${JID}/orchard" xmlns="jabber:client">
        <received xmlns="urn:xmpp:receipts" id="${sent.id}"/>
      </message>`);
    await mock.converse.env.u.waitUntil(() => updated.some((m) => m.id === sent.id));
    expect(updated.find((m) => m.id === sent.id)?.status).toBe('delivered');
  });

  it('opens a chat, hides the others and clears the unread counter', async () => {
    // A roster contact: a stranger's chat would wait for the blocklist IQ, which the mock never answers.
    const opened = await repositories.chat.open(MERCUTIO);
    expect(opened).toMatchObject({ id: MERCUTIO, title: 'mercutio', unreadCount: 0 });
    const hidden = (jid: string) => mock._converse.state.chatboxes.get(jid)?.get('hidden');
    expect([hidden(MERCUTIO), hidden(JULIET)]).toEqual([false, true]);
    expect((await repositories.chat.list()).map((c) => c.id).sort()).toEqual([JULIET, MERCUTIO]);
    expect(chats.filter((c) => c.id === JULIET).at(-1)?.unreadCount).toBe(1);
    await repositories.chat.markRead(JULIET);
    expect(chats.at(-1)).toMatchObject({ id: JULIET, unreadCount: 0 });
    await expect(repositories.chat.messages('nobody@montague.lit')).rejects.toMatchObject({
      code: 'Unknown',
    });
  });

  it('counts unread messages for every chat but the open one', async () => {
    const { stx, u } = mock.converse.env;
    const message = (from: string, id: string) =>
      stx`<message from="${from}/r" to="${JID}/orchard" type="chat" id="${id}" xmlns="jabber:client">
        <body>${id}</body></message>`;
    inject(message(JULIET, 'u1'));
    await u.waitUntil(() => chats.some((c) => c.id === JULIET && c.unreadCount === 1));
    inject(message(MERCUTIO, 'u2'));
    await u.waitUntil(() => received.some((m) => m.body === 'u2'));
    expect((await repositories.chat.list()).map((c) => [c.id, c.unreadCount])).toEqual(
      expect.arrayContaining([
        [JULIET, 1],
        [MERCUTIO, 0],
      ]),
    );
  });

  it('reports a sent message through onChatChange', async () => {
    const before = chats.length;
    const sent = await repositories.chat.send(MERCUTIO, 'from me');
    const change = chats.slice(before).find((c) => c.id === MERCUTIO);
    expect(change?.lastMessage?.id).toBe(sent.id);
    expect(received.find((m) => m.id === sent.id)).toBeUndefined();
  });

  it('pages history with MAM and ignores live messages arriving meanwhile', async () => {
    const { stx, u, sizzle, Strophe } = mock.converse.env;
    const conn = await connection();
    inject(stx`<message from="${JULIET}/r" to="${JID}/orchard" type="chat" id="anchor" xmlns="jabber:client">
        <body>anchor</body><stanza-id xmlns="urn:xmpp:sid:0" id="sid-anchor" by="${JID}"/></message>`);
    const anchor = await u.waitUntil(() => received.find((m) => m.body === 'anchor'));
    const paging = repositories.chat.messages(JULIET, { before: anchor?.id ?? '', limit: 10 });
    // Converse only queries the archive once the account advertises MAM (disco#info on the bare JID).
    const disco = await u.waitUntil(() =>
      conn.IQ_stanzas.filter(
        (iq) =>
          iq.getAttribute('to') === JID &&
          sizzle(`query[xmlns="${Strophe.NS.DISCO_INFO}"]`, iq).length,
      ).pop(),
    );
    inject(stx`<iq type="result" from="${JID}" to="${conn.jid}" id="${disco?.getAttribute('id')}" xmlns="jabber:client">
        <query xmlns="${Strophe.NS.DISCO_INFO}"><feature var="${Strophe.NS.MAM}"/></query></iq>`);
    const query = await u.waitUntil(() =>
      conn.IQ_stanzas.filter((iq) => sizzle(`query[xmlns="${Strophe.NS.MAM}"]`, iq).length).pop(),
    );
    const queryId = sizzle(`query[xmlns="${Strophe.NS.MAM}"]`, query as Element)[0]?.getAttribute(
      'queryid',
    );
    inject(stx`<message to="${conn.jid}" xmlns="jabber:client">
        <result xmlns="${Strophe.NS.MAM}" queryid="${queryId}" id="sid-old">
          <forwarded xmlns="urn:xmpp:forward:0">
            <delay xmlns="urn:xmpp:delay" stamp="2026-10-14T10:00:00Z"/>
            <message from="${JULIET}/r" to="${JID}" type="chat" id="old" xmlns="jabber:client"><body>old</body></message>
          </forwarded></result></message>`);
    inject(stx`<message from="${JULIET}/r" to="${JID}/orchard" type="chat" id="live" xmlns="jabber:client">
        <body>live</body></message>`);
    inject(stx`<iq type="result" to="${conn.jid}" id="${query?.getAttribute('id')}" xmlns="jabber:client">
        <fin xmlns="${Strophe.NS.MAM}" complete="true"><set xmlns="http://jabber.org/protocol/rsm">
          <first>sid-old</first><last>sid-old</last></set></fin></iq>`);
    const page = await paging;
    expect(page.map((m) => m.body)).toEqual(['old']);
    await u.waitUntil(() => received.some((m) => m.body === 'live'));
  });
});

describe('sign out and sign in again', () => {
  it('reuses the engine for a second session', async () => {
    await repositories.xmpp.disconnect();
    expect(states.at(-1)).toEqual(['offline', undefined]);
    await connectAndLoadRoster();
    expect(states.at(-1)).toEqual(['online', undefined]);
    expect(await repositories.roster.list()).toHaveLength(2);
  });

  it('reports an authentication failure after being online as offline with the error', async () => {
    const { Status } = mock.converse.env.Strophe;
    const conn = await connection();
    // Dropping while `initializeDisco` still runs crashes Converse (its `clearSession` races it).
    await mock.api.waitUntil('discoInitialized');
    const dropped = nextEvent('disconnected');
    conn._changeConnectStatus(Status.AUTHFAIL ?? 4, 'not-authorized');
    await dropped;
    expect(states.at(-1)).toEqual(['offline', 'InvalidCredentials']);
  });

  it('rejects, and reports error, when the connection drops after connected', async () => {
    const { Status } = mock.converse.env.Strophe;
    const before = states.length;
    const connected = nextEvent('connected');
    const connecting = repositories.xmpp.connect({
      jid: JID,
      password: 'secret',
      websocketUrl: '',
    });
    await connected;
    await mock.api.waitUntil('discoInitialized');
    const conn = mock.api.connection.get();
    conn?._changeConnectStatus(Status.DISCONNECTED ?? 6, 'remote-connection-failed');
    await expect(connecting).rejects.toMatchObject({ code: 'ServerUnreachable' });
    expect(states.slice(before)).toEqual([['error', 'ServerUnreachable']]);
  });

  it('serializes two sign-ins into one connection', async () => {
    let initialized = 0;
    mock.api.listen.on('connectionInitialized', () => {
      initialized += 1;
    });
    const first = repositories.xmpp.connect({ jid: JID, password: 'secret', websocketUrl: '' });
    const second = repositories.xmpp.connect({ jid: JID, password: 'secret', websocketUrl: '' });
    await answerRoster();
    await Promise.all([first, second]);
    expect(initialized).toBe(1);
    await repositories.xmpp.disconnect();
  });
});
