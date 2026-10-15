# `@converse/headless` 14.0.0, as we use it

_Research of 2026-10-15, read from the npm package source (`converse-headless-14.0.0.tgz`, paths
below are relative to its root) and, for the UI-only plugins, from `conversejs/converse.js`
master on GitHub. Verify against the installed version when something looks off; the package is
pinned in `packages/core/package.json`._

The engine lives behind `packages/core/src/repositories/converse/`. Nothing outside that folder
imports it. This page is the map an implementer needs.

## 1. Initialization

Only keys of `DEFAULT_SETTINGS` (`shared/settings/constants.js:35-112`) and of plugin
`api.settings.extend` calls are accepted by `converse.initialize`; plugin keys passed at init are
re-merged later (`shared/settings/utils.js:37-45`).

```js
await converse.initialize({
  websocket_url: relayUrl,               // ws://127.0.0.1:<port>/xmpp/<token>?domain=…
  discover_connection_methods: false,    // no XEP-0156 fetch (connection/index.js:116-119)
  blacklisted_plugins: ['converse-bosh'],
  authentication: 'login', auto_login: false,
  persistent_store: 'IndexedDB',         // only applied when the config is 'trusted'
  view_mode: 'overlayed',                // nothing auto-hidden; we drive chat.save({hidden}) ourselves
  allow_non_roster_messaging: true, auto_reconnect: true, enable_smacks: true,
  archived_messages_page_size: 50, mam_request_all_pages: false,
  loglevel: 'warn', assets_path: '',     // '' → '/emoji.json'; '/' would give '//emoji.json'
});
await api.user.login(jid, password);     // resolves when connect *starts*; watch the events
```

- `message_carbons` does not exist: carbons are always enabled when the server has them.
- `view_mode` `'fullscreen'`/`'embedded'` hide every chat but one and count unread from `hidden`;
  `'overlayed'` leaves that to us.
- Runtime assets: copy `dist/emoji.json`, `dist/libomemo.esm.min.js` and
  `dist/curve25519_compiled.wasm` to the app's `public/`. The OMEMO loader uses
  `globalThis.__WASM_BASE__` (set it to `'/'`, trailing slash) to find the wasm; the lazy
  `import('./libomemo.esm.min.js')` carries a `webpackIgnore` comment that Vite ignores: check the
  build output or mark it external.
- Logout: `api.user.logout()`.

## 2. Connection lifecycle

All status handling: `shared/connection/index.js:358-421`. Events: `connectionInitialized`,
`beforeResourceBinding`, `afterResourceBinding(reconnecting)`, `connected`, `reconnected`,
`will-reconnect`, `disconnected`, `connfeedback` (every status change, model
`_converse.state.connfeedback` with `connection_status` and `message`), then `statusInitialized`,
`presencesInitialized`, `rosterContactsFetched`, `chatBoxesFetched`, `streamResumptionFailed`,
`logout`, `initialized`. Many are also promises: `await api.waitUntil('rosterContactsFetched')`.

Auth vs network: compare `connfeedback.get('connection_status')` with `Strophe.Status.AUTHFAIL`
(no reconnect; `disconnection_cause` set), `CONNFAIL` (`condition` string such as `host-unknown`,
`remote-connection-failed`), `ERROR`, `DISCONNECTED`, `RECONNECTING`. Raw reason:
`api.connection.get().disconnection_cause` / `.disconnection_reason`. Helpers:
`api.connection.connected()`, `.authenticated()`, `.reconnect()` (debounced 3 s), `.disconnect()`.

## 3. Roster

`_converse.state.roster` (collection, persisted per account), `api.contacts.get(jid?)` waits for
`rosterContactsFetched`. Contact attrs: `jid`, `nickname`, `groups`, `subscription`
(`none|to|from|both`, `undefined` = unsaved auto-created contact → `contact.isUnsaved()`), `ask`,
`requesting`, `num_unread`, `status`; presence on `contact.presence` (`presence` online/offline,
`show` chat/away/dnd/xa); `contact.getStatus()`, `contact.getDisplayName()`.

Events: `contactPresenceChanged(contact)`, `rosterContactInitialized`, `rosterPush`,
`contactRequest(contact)`; plus the collection's own `add`/`remove`/`change`. No
`rosterContactAdded`.

`api.contacts.add({jid, name, groups}, persist, subscribe, message)`; on IQ error it calls the
global `alert()` (`plugins/roster/contacts.js:193`): **override `window.alert`**.
`api.contacts.remove(jid, unsubscribe)`, `contact.authorize()/unauthorize()/remove()`.

## 4. Chats and messages

`api.chats.get(jid, attrs, create)`, `api.chats.open(jid)`. `chat.messages` is a collection
sorted by `time`; `chat.messages.fetched` is a promise. Message attrs (parser
`plugins/chat/parsers.js:107-160`): `id`, `msgid`, `origin_id`, `stanza_id <by>`, `from`, `to`,
`body`, `plaintext`, `sender` `'me'|'them'`, `time`, `is_delayed`, `is_archived`, `is_carbon`,
`is_encrypted`, `is_error`, `error_condition`, `error_text`, `retracted`, `edited`, `oob_url`,
`references`, `received`, `chat_state`, `type`, `file`/`progress`/`upload`, `reactions`,
`dangling_reaction`.

- `received`: set on incoming messages at parse time; on our own messages only when a XEP-0184
  receipt arrives → **truthy on own message = delivered**.
- Send: `await chat.sendMessage({ body })` (adds `<request/>` receipts and `<origin-id/>`, no
  `<markable/>`).
- Receive: prefer `chat.messages.on('add', …)` over the global `message` event, which fires before
  the model exists.
- Unread: `chat.get('num_unread')`, counted only while `chat.isHidden()` (= `hidden` or
  `ui.scrolled` or `document.hidden`). Mark read: `chat.clearUnreadMsgCounter()` (sends the
  `displayed` marker when allowed).
- Known bug in 14.0.0: incoming markers for our messages are saved under the literal key
  `field_name` (`plugins/chat/model.js:230`), so `marker_displayed` never appears on 1:1 messages.
- Typing: `chat.setChatState('composing')`; incoming in `chat.notifications.get('chat_state')`.

## 5. MAM

Opening a chat fetches the cache, then `fetchNewestMessages` (newest page backwards from the most
recent known message). Reconnection catch-up is automatic (`reconnected` →
`chatReconnected` → `fetchNewestMessages`). Older history:
`u.mam.fetchArchivedMessages(chat, { rsm: { before: oldest.get('stanza_id <bare_jid>'), max } }, false)`
(`u` = `converse.env.u`). Results arrive through `chat.messages`; a sync `MAMResult` event fires.
Incomplete pages add a `MAMPlaceholderMessage` to `chat.messages`: **filter it out**
(`instanceof MAMPlaceholderMessage`). Low level: `api.archive.query({ mam, rsm })`.

## 6. Reactions (XEP-0444)

Headless receives only: `message.get('reactions')` is `Record<senderBareJid, string[]>`;
reactions that arrive before their target are stored as messages with `dangling_reaction: true`
(filter out). No event: `message.on('change:reactions')`. Sending is ours to write:

```js
api.send(stx`<message to="${chat.get('jid')}" type="chat" id="${u.getUniqueId('reaction')}" xmlns="jabber:client">
  <reactions xmlns="urn:xmpp:reactions:0" id="${message.get('msgid')}">${emojis.map((e) => stx`<reaction>${e}</reaction>`)}</reactions>
  <store xmlns="urn:xmpp:hints"/></message>`);
```

and advertise the feature: `api.listen.on('addClientFeatures', () => api.disco.own.features.add(Strophe.NS.REACTIONS))`.
In an OMEMO chat: `api.omemo.send(chat, fallbackBody, [reactionsEl, fallbackEl])`.

## 7. HTTP upload (XEP-0363)

`chat.sendFiles(files)`: upload JID from disco, `max-file-size` from its data form (oversize →
ephemeral error message), per file a placeholder message with `progress` 0..1, then a message
with `body` = URL and `oob_url`. With OMEMO, `beforeFileUpload` encrypts (AES-256-GCM) and the
body becomes `aesgcm://…#ivkey`, `oob_url` null. **Headless does not download or decrypt
`aesgcm://` on receipt.** That download and decryption is ours to write, planned for milestone 4
(files); as of 2026-10-15 the chat repository only maps such a body to an `Attachment` with
`encryption: 'aesgcm'` and the `#ivkey` fragment in `decryptionKey`, never in `url`. There is no
`api.upload`.

## 8. OMEMO

Enabled only with a trusted config. `initOMEMO` on `statusInitialized` → `OMEMOInitialized`.
Per chat: `omemo_supported`, `omemo_active` (restored from `u.omemo.getOMEMOActiveState(jid)` or
`omemo_default`). Enable: `chat.save({ omemo_active: true }); u.omemo.setOMEMOActiveState(jid, true)`.
Devices: `api.omemo.devicelists.get(jid)`, `u.omemo.getDevicesForContact(jid, version)`; device
attrs `id`, `jid`, `bundle`, `trusted` (0 undecided, 1 trusted, −1 untrusted), `active`;
`await u.omemo.generateFingerprint(device)` then `device.get('bundle').fingerprint`.
`device.save('trusted', -1)` excludes a device. Failed decryption → message with `is_error`,
`error_type: 'Decryption'`, `error_condition` (`not-encrypted-for-this-device`…),
`is_ephemeral: true` whose timer only starts if we call `message.startEphemeralTimer()` (we do
not: we keep it as `undecryptable`). OMEMO 2 and 0.3: no switch, both blocks go in one stanza.
**Pitfall:** `handleMessageSendError` calls `api.alert(...)`, undefined in headless: define
`api.alert` in our own plugin or the real error is masked by a TypeError.

## 9. In-band registration (XEP-0077)

Not in headless. The UI plugin (`src/plugins/register/form.js`) does: `api.connection.init()`,
`conn.connect(domain, '', cb)`, patches `conn._connect_cb` while registering, reads the stream
features (needs `<register/>`), sends `<iq type="get"><query xmlns="jabber:iq:register"/></iq>`
through `conn.send` with a `conn._addSysHandler`, parses legacy fields or an `x:data` form, submits
`<iq type="set">`, maps `conflict` / `not-acceptable` errors, then `connection.reset()` and logs
in. It relies on Strophe private members (`_connect_cb`, `_proto._connect_cb`, `_addSysHandler`).
`api.sendIQ` throws before authentication. Account deletion after login:
`api.sendIQ(stx\`<iq type="set" xmlns="jabber:client"><query xmlns="jabber:iq:register"><remove/></query></iq>\`)`.

## 10. Logging

`log.setLogLevel('fatal')` is the quietest. At `debug`, every stanza is logged in full (bodies
and SASL included); at `warn` and `error`, stanzas with bodies are still logged on parse errors
(`log.error(stanza)`) and when sending while disconnected. The engine therefore runs at `fatal` in
production and only switches to `debug` when `createConverseRepositories({ debug: true })` is asked
for explicitly (`engine.ts`). Strophe's own level follows (`shared/connection/utils.js:13-25`).

## 11. Webview and test hazards

- Import time touches `window.document` and `window.converse`: Vitest needs jsdom.
- `localStorage['conversejs-session-jid']`, sessionStorage, IndexedDB (absent in jsdom: use
  `persistent_store: 'localStorage'` in tests or `fake-indexeddb`).
- `document.hidden` drives unread counting and pings.
- Globals: `alert()`, undefined `api.alert`, `crypto.subtle`, `XMLHttpRequest` (uploads),
  `fetch` (emoji), `DOMParser`, `WebSocket`. No `navigator.onLine`.
- No `eval`. libomemo uses WebAssembly and may spawn a Worker: CSP `script-src 'self'
  'wasm-unsafe-eval'`, `worker-src 'self'`, `connect-src` with the relay and the upload hosts.
- Test hook: `bosh_service_url: 'montague.lit/http-bind'` makes `isTestEnv()` true and swaps in a
  `MockConnection` with `sent_stanzas` / `IQ_stanzas`.
- `_converse` is a Proxy: use `_converse.state.*`.
- Real WebSocket under Vitest + jsdom (`contract.test.ts`, checked on 2026-10-15 with jsdom 30.1.3,
  Node 26.11): jsdom's `WebSocket` wraps undici's and fires `new Event('open')` with the *global*
  `Event`, which Vitest's jsdom environment has replaced by jsdom's; Node's `EventTarget` rejects
  it and no socket ever opens. The test restores Node's `Event` on `globalThis` (taken from a
  native `MessageChannel` message, since no module exports it any more).
- jsdom's `outerHTML` on an XML element is a strict serialization: it throws
  `Invalid attribute localName value` on Strophe's `xmlns` attributes (set with `setAttribute`, so
  in no namespace). Converse's `Connection.xmlInput/xmlOutput` evaluate `body.outerHTML` for every
  stanza before `log.debug` drops it, which aborted the connection in `<open/>`. See §12, `xmpp.ts`.
- libomemo's emscripten glue detects Node (`typeof process`), loads the wasm with `fs` when `fetch`
  fails, and registers `process.on('unhandledRejection', throw)` **per key pair**: an unhandled
  rejection anywhere kills the Vitest worker (exit code 7), and Node warns about more than ten
  listeners. The test serves `dist/curve25519_compiled.wasm` and `dist/emoji.json` through a
  `fetch` stub so that OMEMO initializes normally (it publishes its device list and bundle to PEP).
- RFC 7395 framing: a stanza sent over the WebSocket has no `<stream>` parent, so it must carry
  `xmlns="jabber:client"` itself or Prosody closes the stream (`test-support/bobClient.ts`).

## 12. What the repository actually does

_Implementation of 2026-10-15, `packages/core/src/repositories/converse/`. Verified against the
installed package and by `repositories.test.ts`, which drives the real headless build over its
`MockConnection` in jsdom._

- `engine.ts`: one `ConverseEngine` per process. `@converse/headless` is imported lazily (its
  import touches `window`), `converse.initialize` runs once. A second sign-in only calls
  `api.user.login` again: `api.user.logout` ends in `api.connection.destroy()` which drops the
  connection, and `login` creates a new one (`shared/connection/api.js:27-50`). `initialize` could
  be called again (its `cleanup` is made for Converse's tests) but it also removes every listener,
  so we never do. Settings of §1 plus `keepalive: false` and `reuse_scram_keys: false` (SCRAM keys
  in IndexedDB would be a stored credential; the password lives in the keychain). `api.alert` and
  `window.alert` are replaced by a `console.warn` with no content.
- `xmpp.ts`: `connect` and `disconnect` run through one promise chain (a second sign-in with the
  same account while online is a no-op; with another account it signs out first). `connect` sets
  `websocket_url` per call, turns `auto_reconnect` off until `connected`
  (otherwise a failed first attempt loops through `reconnect`, `shared/connection/index.js:333`),
  resolves after this attempt's `connected` + `rosterContactsFetched` + `chatBoxesFetched` events
  (not `api.waitUntil`: only `logout` renews those promises, after a drop they are still resolved
  from the previous session), emits `online` only then (and `error` when the attempt fails after
  `connected`), rejects with
  `InvalidCredentials` on AUTHFAIL, `ServerUnreachable` on CONNFAIL/DISCONNECTED/timeout (30 s),
  `CertificateInvalid` when the WebSocket close reason says so. The close reason is read by wrapping
  `connection._proto._onClose` at `connectionInitialized`: Strophe discards `event.reason` and does
  nothing at all for a clean close before the stream opened (`strophe.js/src/websocket.js:360-378`),
  so the wrapper also turns that case into a CONNFAIL. The same hook replaces the connection's
  `xmlInput`/`xmlOutput` with no-ops: Converse serializes every stanza for a debug line that the
  log level drops (`shared/connection/index.js:32-39`), we never log stanzas, and jsdom's
  serializer throws on them (§11). `onStateChange`: `connected`/`reconnected`
  → `online`, `will-reconnect` → `connecting`, `disconnected` → `offline` (with the last
  AUTHFAIL/CONNFAIL as error), only after having been online: a failed sign-in and the logout
  cascade below also fire `disconnected`. A constructor-level `connfeedback` listener keeps the last
  AUTHFAIL/CONNFAIL so that a drop after being online carries `InvalidCredentials` or
  `ServerUnreachable`.
- `roster.ts`: `rosterInitialized` fires at every login with a new collection (`plugins/roster/utils.js:14-19`):
  the repository re-binds `add`/`change`/`remove` each time; `contactPresenceChanged` and
  `contactRequest` come from `api.listen`. `remove` on the collection is reported with
  `subscription: 'none'`, like the fake.
- `chat.ts`: the `chatboxes` collection is created once at `pluginsInitialized` and only emptied on
  logout, so it is bound once (`engine.onReady`). Every direct chat added to it is hidden
  (`chat.save({ hidden: true })`) unless it is the one `open()` is showing: Converse creates chats
  visible (`plugins/chat/model.js:30`) and `handleUnreadMessage` only counts `num_unread` while
  `isHidden()` (`shared/model-with-messages.js:862-880`), otherwise it sends a displayed marker as
  if the user were reading; a conversation started by an incoming message would never be unread
  (found by the contract test, 2026-10-15). `onMessage` fires for live stanzas only: not for
  `is_archived` (MAM) results, which would notify a chat's whole history on first open, and not for
  our own messages unless they are carbons (own messages still raise `chat.updated`). Archived
  messages reach the UI through `messages()`, `chat.updated` and the unread counter. In overlayed
  mode a chat is born with `hidden: false` (`plugins/chat/model.js:30`) and `num_unread` is only
  counted while a chat `isHidden()` (§4): the repository remembers the open JID and saves
  `hidden: jid !== openJid` on every chat it binds and in `open(jid)`. `messages({ before })` pages
  with `u.mam.fetchArchivedMessages(chat, { rsm: { before: <stanza_id>, max } }, false)`, then waits
  for `chat.msg_chain` (`handleMAMResult` queues the results without awaiting them) and returns the
  `is_archived` models added meanwhile; a message without `stanza_id <bare_jid>` yields `[]`.
  Retracted messages come out with an empty body and no attachment (`retracted: true`); dangling
  retractions and reactions are dropped.
- `mappers.ts`: pure functions, unit-tested with plain `{ get }` objects. Attachments: an http(s)
  `oob_url`, or a body that is only an `aesgcm://` URL (its `#ivkey` goes to `decryptionKey`); a bare
  link in a body is just a link. A file name whose percent-escapes are malformed is kept raw.

### Contract test

`contract.test.ts` (run with `pnpm --filter @hey-postie/core test:contract`, see
[technical-guide.md](technical-guide.md#test-server)) drives `createConverseRepositories()` as
`alice@localhost` through a real `wss://` WebSocket to the local Prosody 13
([tools/xmpp-server](../../tools/xmpp-server/README.md)); `bob@localhost` is a hand-written
XMPP-over-WebSocket client (`test-support/bobClient.ts`: `<open/>`, SASL PLAIN, bind, raw stanzas)
so that the two sides are independent. Six scenarios in order, all passing on 2026-10-15: wrong
password → `InvalidCredentials` then sign-in → `online`; `roster.add` → bob accepts and subscribes
back → `subscription: 'both'`, bob's presence → `online`; bob's message → `onMessage`, `unreadCount`
1, `markRead` → 0; `send` → bob receives it with `<request/>`, his receipt → `delivered`; three
messages while alice is signed out → MAM catch-up after sign-in, `messages({ before })` answers;
sign-out and sign-in again. Observed along the way:

- Prosody's `mod_mam` archives messages to an offline user and swallows the bounce (no
  `mod_offline` is loaded): the test synchronizes on an IQ ping instead.
- The server keeps the archive and the roster between runs. Fixture ids carry a run token:
  Converse dedupes by `{ from, msgid, body }` (`getMessageBodyQueryAttrs`), so a reused stanza id
  makes an old archived copy swallow the new message. Bob removes alice from his roster at start
  and end, alice removes bob before adding him again.
- `roster.add` ends in `both` without any repository code for the request: Converse authorizes an
  incoming `subscribe` by itself when the contact has `ask="subscribe"` or `subscription="to"`
  (`plugins/roster/contacts.js:405-431`).

### Corrections to the map above

- Direct chats have `type === 'chatbox'` (`PRIVATE_CHAT_TYPE`, `shared/constants.js:66`), not `chat`.
- `connected`, `reconnected`, `disconnected` are events only: `api.waitUntil('connected')` returns
  `null` (`shared/api/promise.js`), which an `await` silently treats as resolved. Promises exist for
  `rosterContactsFetched`, `chatBoxesFetched`, `statusInitialized`, `OMEMOInitialized`...
- `bosh_service_url` is a setting of the `converse-bosh` plugin: with that plugin blacklisted,
  Converse answers `login` with DISCONNECTED "Could not automatically determine a connection URL"
  unless `websocket_url` is set. The test hook (§11) therefore needs the BOSH plugin enabled and
  **no** `websocket_url`: with a `ws://` URL the mock still uses Strophe's WebSocket transport, whose
  `_onIdle` dereferences a socket that was never opened. The repository tests pass `websocketUrl: ''`.
- `getDisplayName()` falls back to the JID itself (`plugins/roster/contact.js:79`); the mappers
  treat that as "no name" and use the local part.
- Logout cascade: `finishDisconnection` calls `api.connection.destroy()`, whose `disconnect()` on
  the already closed connection re-enters `onDisconnected` → `finishDisconnection` twice more. Those
  late passes destroy whatever connection exists at that moment, including a fresh login's.
  `connect()` and `disconnect()` wait until no connection has existed for three 10 ms ticks.
- In the test hook, `isTestEnv()` makes `shouldClearCache` true, so every disconnect runs
  `clearUserSettings` (`shared/settings/user/utils.js`); the cascade above runs it concurrently and
  the second pass sets its module variable to `undefined` under the first (`TypeError: reading
  'clear'`, an unhandled rejection that fails Vitest). Not reachable in production (trusted config,
  `clear_cache_on_logout` false); the repository test wraps `api.user.settings.clear` to swallow it.
- Opening a chat with a JID that is not in the roster awaits `api.blocklist.get()`
  (`shared/model-with-contact.js:59`): fine with a server, but the mock never answers that IQ.
- Vite (rolldown) resolves the `import('./libomemo.esm.min.js')` at build time and emits
  `dist/assets/libomemo.esm.min-<hash>.js` (99 kB; two harmless "path/fs externalized" warnings).
  The `webpackIgnore` comment is irrelevant, nothing to externalize. libomemo looks for the wasm at
  `__WASM_BASE__ + 'curve25519_compiled.wasm'`, and Converse sets `__WASM_BASE__` to the page's
  directory when no `<script src>` mentions converse (`dist/converse-headless.js:46599-46616`), so
  `curve25519_compiled.wasm` (84 kB) and `emoji.json` (264 kB) sit in `apps/desktop/public/`.
  Checked on the 2026-10-15 build output; the OMEMO load itself is not exercised yet.
