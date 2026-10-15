/**
 * A minimal XMPP-over-WebSocket client (RFC 7395 framing, SASL PLAIN, resource binding) for the
 * contract tests: the peer that talks to the repositories under test, written without Converse
 * so that the two sides are independent. One stanza per WebSocket frame; parsed with DOMParser.
 */

const NS = {
  framing: 'urn:ietf:params:xml:ns:xmpp-framing',
  sasl: 'urn:ietf:params:xml:ns:xmpp-sasl',
  bind: 'urn:ietf:params:xml:ns:xmpp-bind',
  muc: 'http://jabber.org/protocol/muc',
  mucUser: 'http://jabber.org/protocol/muc#user',
};

/**
 * Bob's available presence. The test accounts are shared with other sessions (an agent's Converse
 * signed in as bob was seen online on 2026-10-16) and the server delivers bare-JID messages to the
 * highest-priority resources only: a high priority keeps alice's messages coming to this client.
 */
export const AVAILABLE = '<presence><priority>10</priority></presence>';

export interface BobClient {
  readonly jid: string;
  send(xml: string): void;
  /** Resolves with the first stanza (already received or to come) matching the predicate. */
  waitFor(predicate: (stanza: Element) => boolean, timeoutMs?: number): Promise<Element>;
  /** Drops the stanzas received so far, so that `waitFor` only sees new ones. */
  forget(): void;
  /** XEP-0045 §7.2: sends the join presence and resolves on the self-presence (code 110). */
  joinRoom(roomJid: string, nick: string): Promise<Element>;
  leaveRoom(roomJid: string, nick: string): void;
  close(): Promise<void>;
}

export async function connectBob(input: {
  url: string;
  jid: string;
  password: string;
  resource?: string;
}): Promise<BobClient> {
  const domain = input.jid.split('@')[1] ?? '';
  const socket = new WebSocket(input.url, ['xmpp']);
  const backlog: Element[] = [];
  const waiters = new Set<(stanza: Element) => void>();

  socket.addEventListener('message', (event) => {
    const stanza = parse(String(event.data));
    if (!stanza) return;
    backlog.push(stanza);
    for (const waiter of waiters) waiter(stanza);
  });

  const client: BobClient = {
    jid: input.jid,
    send: (xml) => socket.send(qualify(xml)),
    waitFor: (predicate, timeoutMs = 10_000) =>
      new Promise<Element>((resolve, reject) => {
        const found = backlog.find(predicate);
        if (found) return resolve(found);
        const timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`bob: no matching stanza within ${timeoutMs} ms`));
        }, timeoutMs);
        const waiter = (stanza: Element) => {
          if (!predicate(stanza)) return;
          clearTimeout(timer);
          waiters.delete(waiter);
          resolve(stanza);
        };
        waiters.add(waiter);
      }),
    forget: () => backlog.splice(0),
    joinRoom: async (roomJid, nick) => {
      socket.send(qualify(`<presence to="${roomJid}/${nick}"><x xmlns="${NS.muc}"/></presence>`));
      const self = await client.waitFor(isSelfPresenceFrom(roomJid));
      // A room bob just created is locked (status 201) until its owner accepts the instant
      // configuration: other users get `item-not-found` until then (XEP-0045 §10.1.1).
      if (hasStatusCode(self, '201')) {
        const id = `instant-${Date.now().toString(36)}`;
        client.send(
          `<iq type="set" to="${roomJid}" id="${id}"><query xmlns="${NS.muc}#owner"><x xmlns="jabber:x:data" type="submit"/></query></iq>`,
        );
        await client.waitFor((st) => st.localName === 'iq' && st.getAttribute('id') === id);
      }
      return self;
    },
    leaveRoom: (roomJid, nick) =>
      socket.send(qualify(`<presence to="${roomJid}/${nick}" type="unavailable"/>`)),
    close: () =>
      new Promise<void>((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) return resolve();
        socket.addEventListener('close', () => resolve(), { once: true });
        socket.send(`<close xmlns="${NS.framing}"/>`);
        socket.close();
      }),
  };

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('bob: WebSocket error')), {
      once: true,
    });
  });

  const open = `<open xmlns="${NS.framing}" to="${domain}" version="1.0"/>`;
  client.send(open);
  await client.waitFor(isFeatures);
  const user = input.jid.split('@')[0] ?? '';
  const credentials = btoa(`\0${user}\0${input.password}`);
  client.send(`<auth xmlns="${NS.sasl}" mechanism="PLAIN">${credentials}</auth>`);
  const outcome = await client.waitFor(
    (s) => s.namespaceURI === NS.sasl && s.localName !== 'challenge',
  );
  if (outcome.localName !== 'success') throw new Error(`bob: SASL ${outcome.localName}`);
  client.forget();
  client.send(open);
  await client.waitFor(isFeatures);
  client.send(
    `<iq type="set" id="bind-1"><bind xmlns="${NS.bind}"><resource>${input.resource ?? 'contract'}</resource></bind></iq>`,
  );
  const bound = await client.waitFor(
    (s) => s.localName === 'iq' && s.getAttribute('id') === 'bind-1',
  );
  if (bound.getAttribute('type') !== 'result') throw new Error('bob: bind failed');
  client.forget();
  client.send(AVAILABLE);
  return client;
}

/** Framed streams have no `<stream>` parent: every stanza must declare `jabber:client` itself. */
function qualify(xml: string): string {
  return xml.replace(/^<(iq|message|presence)(?=[\s>/])/, '<$1 xmlns="jabber:client"');
}

function isFeatures(stanza: Element): boolean {
  return stanza.localName === 'features';
}

function parse(frame: string): Element | null {
  const doc = new DOMParser().parseFromString(frame, 'text/xml');
  const root = doc.documentElement;
  return root && root.localName !== 'parsererror' ? root : null;
}

/** The `<message>` stanzas from a bare JID that carry a `<body>`; the body text is not read here. */
export function isChatMessageFrom(bareJid: string) {
  return (stanza: Element): boolean =>
    stanza.localName === 'message' &&
    (stanza.getAttribute('from') ?? '').split('/')[0] === bareJid &&
    stanza.getElementsByTagName('body').length > 0;
}

export function isPresenceFrom(bareJid: string, type: string | null) {
  return (stanza: Element): boolean =>
    stanza.localName === 'presence' &&
    (stanza.getAttribute('from') ?? '').split('/')[0] === bareJid &&
    stanza.getAttribute('type') === type;
}

/** The room presence about ourselves (status code 110). */
function isSelfPresenceFrom(roomJid: string) {
  return (stanza: Element): boolean =>
    isPresenceFrom(roomJid, null)(stanza) && hasStatusCode(stanza, '110');
}

function hasStatusCode(stanza: Element, code: string): boolean {
  return Array.from(stanza.getElementsByTagNameNS(NS.mucUser, 'status')).some(
    (status) => status.getAttribute('code') === code,
  );
}

/** The `groupchat` messages with a body from a room, whichever occupant sent them. */
export function isGroupchatMessageFrom(roomJid: string) {
  return (stanza: Element): boolean =>
    isChatMessageFrom(roomJid)(stanza) && stanza.getAttribute('type') === 'groupchat';
}
