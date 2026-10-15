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
In an OMEMO chat: `api.omemo.send(chat, fallbackBody, [reactionsEl, fallbackEl])`. Built in
[§15](#15-parcels-and-reactions-what-the-repository-does).

## 7. HTTP upload (XEP-0363)

`chat.sendFiles(files)`: upload JID from disco, `max-file-size` from its data form (oversize →
ephemeral error message), per file a placeholder message with `progress` 0..1, then a message
with `body` = URL and `oob_url`. With OMEMO, `beforeFileUpload` encrypts (AES-256-GCM) and the
body becomes `aesgcm://…#ivkey`, `oob_url` null. **Headless does not download or decrypt
`aesgcm://` on receipt.** That download and decryption is ours to write, planned for milestone 4
(files); as of 2026-10-15 the chat repository only maps such a body to an `Attachment` with
`encryption: 'aesgcm'` and the `#ivkey` fragment in `decryptionKey`, never in `url`. There is no
`api.upload`. The download side is `file.ts`, see [§15](#15-parcels-and-reactions-what-the-repository-does).

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
What we built on this: [§13](#13-registration-xep-0077-what-the-repository-does).

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
- A first sign-in generates the OMEMO bundle (slow key generation) after `connected`; signing out
  or deleting the account meanwhile empties the device lists under `OMEMOStore.generateBundle`
  (`plugins/omemo/store.js:415-417`, `devicelists.get()` → `null.devices`). In a browser that is a
  console error; under Vitest libomemo's glue turns the unhandled rejection into exit code 7. The
  registration contract test waits for `api.waitUntil('OMEMOInitialized')` before deleting
  (found on 2026-10-15).

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
  retractions and reactions are dropped. Both read paths sort by `time` themselves: the collection
  sorts at insertion only, and one contract run (fixtures colliding with an older run's archived
  copies) returned it out of order.
- `mappers.ts`: pure functions, unit-tested with plain `{ get }` objects. Attachments: an http(s)
  `oob_url`, or a body that is only an `aesgcm://` URL (its `#ivkey` goes to `decryptionKey`); a bare
  link in a body is just a link. A file name whose percent-escapes are malformed is kept raw.
- `room.ts` (with `room-join.ts`, `room-browse.ts`, `room-notify.ts`, `room-mappers.ts`): rooms,
  see §14.

### Contract test

`contract.test.ts` (run with `pnpm --filter @hey-postie/core test:contract`, see
[technical-guide.md](technical-guide.md#test-server)) drives `createConverseRepositories()` as
`alice@localhost` through a real `wss://` WebSocket to the local Prosody 13
([tools/xmpp-server](../../tools/xmpp-server/README.md)); `bob@localhost` is a hand-written
XMPP-over-WebSocket client (`test-support/bobClient.ts`: `<open/>`, SASL PLAIN, bind, raw stanzas)
so that the two sides are independent. The shared preamble (asset `fetch` stub, Node's `Event`
class, §11) is `test-support/contractEnv.ts`; `contract-rooms.test.ts` (§14) is another file.
Vitest runs files in parallel workers, each with its own Converse signing in as alice: the script
passes `--no-file-parallelism`, otherwise the two suites trample each other on the server.
Six scenarios in order, all passing on 2026-10-15: wrong
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

## 13. Registration (XEP-0077): what the repository does

_Implementation of 2026-10-15, `registration.ts` + `registrationForm.ts`, verified by
`registration.test.ts` (real Strophe over a scripted WebSocket) and `registration.contract.test.ts`
(the local Prosody, `allow_registration = true`)._

**Flow.** `form({ domain, websocketUrl })` opens a bare `new Strophe.Connection(websocketUrl)`
(`converse.env.Strophe.Connection`, independent from Converse's login connection; `engine.ready()`
only provides `Strophe`), calls `connect(domain, '', statusCallback)` and replaces
`connection._connect_cb` as the UI plugin does: set `connected = true`, let
`_proto._connect_cb(body)` check for a stream error, then look for
`<register xmlns="http://jabber.org/features/iq-register"/>` in the features. No `<register/>` →
`RegistrationUnsupported`, without sending anything; SASL never starts. Then
`<iq type="get"><query xmlns="jabber:iq:register"/></iq>` goes through `connection.send` with a
`_addSysHandler(handler, null, 'iq', null, id)` (system handlers run unauthenticated; user
handlers do not, `strophe.js/src/connection.js:1279`). The stream **stays open** with the parsed
form: `submit` answers on that same session, which a CAPTCHA challenge requires (XEP-0158 binds
the answer to the stream). If the server closed it meanwhile (`connection.connected` false, or
another domain), `submit` opens a new stream and fetches the form again. `submit` always ends with
`connection.disconnect()` (`<close/>`, no presence since unauthenticated). A `form()` that resolves
closes the previously pending stream (so two concurrent `form()` calls keep the last one); a
pending stream nobody submits on is closed after 5 minutes. Only `type="result"` is a success:
`type="error"` maps as below, anything else is `Unknown`. `websocketUrl` must be `wss:`, or `ws:`
to `127.0.0.1` / `localhost` / `[::1]` (the relay): anything else is refused with
`ServerUnreachable` before a socket opens, so that no password travels in clear.

**Parsing** (`registrationForm.ts`, pure DOM): an `<x xmlns="jabber:x:data"/>` child wins over
the legacy children (Prosody sends both). x:data: `text-single`/no type → `text` (`password`,
`email` by name), `text-private` → `password`, `hidden` → `hidden` (required, value kept in
`defaults` and echoed back), `<required/>`; `fixed`, `boolean`, `list-*`, `jid-*` cannot be
rendered: dropped when optional, `RegistrationUnsupported` when `<required/>`. Legacy: every child
except `instructions`, `registered`, `x` (`jabber:x:oob` URLs are ignored) and `key` is a required
field. CAPTCHA (XEP-0158 over XEP-0231): the `ocr` field's `<media><uri>cid:…</uri></media>` is
matched by `cid` to a `<data xmlns="urn:xmpp:bob" cid type>` anywhere in the reply (XEP-0231 puts
it as a child of the `<iq/>`, next to the query; some servers put it inside the query) →
`captchaImageDataUrl` (`data:<type>;base64,…`), `captchaField: 'ocr'`. The data must be
`image/png|jpeg|gif|webp`, base64 only, at most 256 KB decoded; otherwise, or with an `http:` URI,
the form has no image. The local Prosody has no CAPTCHA module (`mod_register_ibr` only, checked on
2026-10-15): the CAPTCHA path is covered by fixtures built from the XEP examples.

**Submit** receives the visible fields only (`RegistrationField` has no value, so the UI neither
renders hidden fields nor echoes them; the CAPTCHA answer comes under `captchaField`). The
repository merges the hidden values it kept from `form()` (`FORM_TYPE`, a CAPTCHA's
`challenge`/`sid`...) itself. It builds `<iq type="set"><query xmlns="jabber:iq:register">` with either
`<x type="submit">` (every field of the form: the user's value, else the server default; empty
optional fields skipped) or one legacy child per value (names restricted to `[a-z][\w-]*`). A
value with a character XML 1.0 cannot carry (C0 controls other than tab/LF/CR, U+FFFE, U+FFFF) is
`RegistrationRejected` before anything is built. Stanzas are built as XML strings, escaped, and
parsed with `DOMParser` (a `parsererror` throws: it would be our bug): Strophe's `Builder.serialize`
writes the `xmlns` *attributes* it finds, and `createElementNS` would not produce any. Known limitation: when the stream of `form()` is gone and
`submit` reopens one, the hidden values come from the re-fetched form; a CAPTCHA challenge of the
first stream is then stale and the server rejects the answer (`RegistrationRejected`).

**Errors.** `conflict` → `AccountConflict`; `not-acceptable`, `bad-request` →
`RegistrationRejected`; `not-allowed`, `forbidden`, `service-unavailable` →
`RegistrationUnsupported`; else `Unknown`. The message is `<code>: <condition>` only; the server's
`<text/>` (which may echo the username, e.g. Prosody's "The requested username is invalid.") goes
to `DomainError.cause`, never to the message.
CONNFAIL → `ServerUnreachable`, or `CertificateInvalid` when the WebSocket close reason says so
(`socketClose.ts`, the same wrapper `xmpp.ts` uses); DISCONNECTED while waiting → `ServerUnreachable`;
20 s without an answer (`connectTimeoutMs` of `createConverseRepositories`) → `ServerUnreachable`.

**`deleteCurrent`** goes through the signed-in connection, calling Strophe's
`connection.sendIQ(iq, callback, errback, timeout)` directly rather than `api.sendIQ`: on a timeout
the latter also throws a `TimeoutError` from a detached `.catch` chain (`shared/api/send.js:63-68`),
a second, unhandled rejection. `errback` gets the error stanza, or `null` on timeout
(`ServerUnreachable`); not connected → `ServerUnreachable` without sending. Prosody closes the stream right after the result; the accounts
service then calls `xmpp.disconnect()`, which is the normal logout path.

**`wipeLocal(jid)`** removes, for the lower-cased bare JID: the localStorage keys prefixed
`converse-persistent/<jid>/` (localForage's localStorage driver layout, `_getKeyPrefix`), our
`hey-postie:<jid>:` keys, `conversejs-session-jid` when it names this account, and, when the engine
is loaded, `_converse.storage.persistent.dropInstance({ name: 'converse-persistent', storeName:
<jid> })` (best effort: a failure is a `console.warn`, the account is already gone from the
server): Converse opens one localForage instance per account (`utils/init.js:106-136, 206`), an
IndexedDB object store named after the JID inside the `converse-persistent` database, and
everything of the account (roster, chats, messages, OMEMO store and sessions, user settings,
login info) lives in it. Not wiped: the keychain (the service does that), `sessionStorage`
(`converse-session`, per tab, gone with the window), the emoji cache and anything not keyed by
JID.

**Strophe privates used:** `Connection#_connect_cb` (replaced), `_proto._connect_cb`,
`_addSysHandler` / `deleteHandler` (the IQ handler is removed on timeout or stream drop),
`connected` (set by hand, as the UI plugin does: `_onIdle` only flushes while connected),
`_proto._onClose` (through `socketClose.ts`). Verify them on every Strophe upgrade
(`strophe.js` 4.0.0 today, a dependency of headless).

**Contract test** (`registration.contract.test.ts`, part of `pnpm test:contract`): `form` of
`localhost` has `username`/`password` (x:data, both required) and instructions; `submit` creates
`reg-<run>-a`, a second `submit` of the same name is `AccountConflict`; `accounts.register` through
`createCore` with the real repositories ends `online` as `reg-<run>-b`; registering `-b` again is
`AccountConflict` and the session stays online; `deleteAccount` then `signIn` → `InvalidCredentials`.
Both accounts are deleted at the end. `test-support/realSocket.ts` duplicates the Node `Event` and
asset-serving fixes of `contract.test.ts` (follow-up: make that file import them). Known limitation:
the OMEMO race of §11 (the service will gate deletion on an `OMEMOInitialized` signal once the crypto
repository lands). Observed: Prosody's
`mod_register_limits` is not throttling here (no `min_seconds_between_registrations`, 127.0.0.1
allow-listed), so many registrations per run are fine.

## 14. Rooms (MUC)

_Implementation of 2026-10-15, `room.ts`, `room-join.ts`, `room-browse.ts`, `room-notify.ts`,
`room-mappers.ts`, plus the room paths of `chat.ts`. Verified by `room.test.ts` (MockConnection)
and `contract-rooms.test.ts` (Prosody, `rooms.localhost`), both green on 2026-10-15._

### What Converse gives

- Models: a room is a chatbox with `type === 'chatroom'` (`CHATROOMS_TYPE`, `shared/constants.js:67`),
  class `MUC` (`plugins/muc/muc.js`). Attributes: `jid`, `nick`, `name` (from disco, else `''`;
  `getDisplayName()` then returns the JID, which the mappers turn into the local part), `subject`
  (`{ author, text }`), `bookmarked`, `hidden`, `num_unread` = messages that mention us,
  `num_unread_general` = every unread message (`muc.js:85-94`). The join state is on a separate
  `chat.session` model: `connection_status` with the values of `converse.ROOMSTATUS`
  (`plugins/muc/constants.js:70`: CONNECTED 0, CONNECTING 1, NICKNAME_REQUIRED 2,
  PASSWORD_REQUIRED 3, DISCONNECTED 4, ENTERED 5, DESTROYED 6, BANNED 7, CLOSING 8); `isEntered()`.
  `chat.session` only exists once `setup()` restored it; `chat.initialized` resolves after that.
  Occupants: `chat.occupants` (`nick`, `jid` in non-anonymous rooms, `role`, `affiliation`,
  `presence` `online|offline`, `occupant_id`); members fetched from the affiliation lists are
  there too with `presence: 'offline'`, so `members()` keeps the present ones only.
- API: `api.rooms.get(jid, { nick, hidden }, create)` creates the model, whose `setup()`
  joins by itself (`muc.js:134-137`); `createChatBox` awaits `initialized`, so the join presence
  is already sent when the call returns and a refusal can arrive before it. An existing model is
  asked with `chat.join(nick, password)`. **The password is never a model attribute**: it would be
  persisted with the chatbox and published to PEP with the bookmark (`enteredNewRoom` copies
  `attributes.password`). A new room therefore joins without it first and, on
  `RoomPasswordRequired`, is asked again with `chat.join(nick, password)` (`room-join.ts`
  `enterNewRoom`); after a restart Converse rejoins without it and the room shows `joined: false`
  until the user joins again with the password. `chat.open(jid)` for a JID that has no model but a
  bookmark, or whose domain is a known conference service (`api.disco.entities.get(domain)` and its
  cached `identities`, not `getIdentity()` which waits for the entity's items), throws
  `RoomNotFound` instead of creating a direct chat with the room's JID. `chat.close()` leaves (unavailable presence, not
  awaited: `muc.js:977`), destroys the model (`chatboxes` fires `remove`) and triggers `leaveRoom`,
  which the bookmarks plugin turns into `autojoin: false` on the bookmark. `muc_clear_messages_on_leave`
  is true by default: the history goes with the model. `api.chats.get(jid)` answers `null` for a
  room (`plugins/chat/api.js:137`): `chat.ts` reads `state.chatboxes.get(jid)` instead.
- Messages: parsed by `plugins/muc/parsers.js`: `from` = `room@service/nick`, `nick`,
  `from_real_jid` (only when the occupant's JID is known), `occupant_id`, `references`
  (XEP-0372), `sender` `'me'` when the occupant id, real JID or nick is ours. Own messages are
  not `is_carbon`, so `chat.ts` keeps not emitting them as `message.received`. A MAM stanza id in a
  room is `stanza_id <room jid>`. Mentions: Converse's `isUserMentioned` uses the references, else a
  **case-sensitive** `\bnick\b` regex; the repository replaces it per model with
  `mappers.isMention` (case-insensitive, nick escaped) so that `mentionsCount` agrees with
  `Message.isMention`. Unread counting needs the room hidden, like direct chats (§12).
- Errors (`muc.js` `onErrorPresence`): `not-authorized` → PASSWORD_REQUIRED, `conflict` →
  NICKNAME_REQUIRED (with `muc_nickname_from_jid` off), `auth`/`forbidden` → BANNED, `gone` →
  DESTROYED, everything else (`item-not-found`, `registration-required`, `not-allowed`,
  `service-unavailable`...) → DISCONNECTED with a localized `disconnection_message`. The condition
  is therefore read by `room-join.ts` itself, through a Strophe `addHandler` on
  `presence type="error"` from the room's bare JID, registered **before** the model is created.
  Converse's own handler runs first and saves the status before ours sees the stanza, so a failed
  status waits 100 ms for the error presence (which settles the join itself) before concluding
  without it: with a zero delay the mock test failed one run in three. Mapping:
  `not-authorized` → `RoomPasswordRequired`, `item-not-found` → `RoomNotFound`, `forbidden` →
  `RoomBanned`, `conflict` → `NickTaken`, else `Unknown`; no answer in 20 s → `ServerUnreachable`.
  The model of a refused join is closed: left in `chatboxes`, Converse would rejoin it at the next
  sign-in (`restoreFromCache` → `join`). An unreachable room (timeout) keeps its model, hence its
  bookmark's autojoin: it is listed `joined: false` and retried by Converse on reconnection.
- Bookmarks (`plugins/bookmarks/`): the collection `_converse.state.bookmarks` exists only after
  `connected` when the server has PEP with `publish-options` (`plugin.js:138`); `bookmarksInitialized`
  then fires with it and is recreated at every sign-in. Without PEP the promise never resolves:
  `setBookmarked` waits 10 s then fails with `Unknown`. `enteredNewRoom` fires on **every** entered
  room and the plugin bookmarks it with `autojoin: true`: on Prosody a joined room is always
  bookmarked. Adding a bookmark (`add` event) runs `openBookmarkedRoom` → `api.rooms.create` +
  `maybeShow()`, which saves `hidden: false` in overlayed mode; `chat.ts` re-asserts its hidden
  policy on `change:hidden`. Unhiding a room clears its counters and rejoins it when DISCONNECTED
  (`onHiddenChange`). Removing a bookmark through the collection closes the room (`leaveRoom`), so
  `setBookmarked(jid, false)` removes the model silently and calls `sendRemoveBookmarkStanza`,
  putting the model back (silently) when the server refuses; without a collection (no PEP) there
  is nothing to remove and it returns at once. The bookmarks fetch IQ carries no `to` attribute.
- Browsing: `api.disco.items(jid)` and `api.disco.info(jid)` send raw IQs (`plugins/disco/api.js`);
  `api.disco.getIdentity('conference', 'text', jid)` goes through the entity cache and tells a MUC
  service from a user domain. `room-browse.ts` (`findRoomService`, behind `roomService()`) looks
  for the service among the domain's items when the domain is not one, then `browse` lists its
  items with one disco#info per room for
  `muc#roominfo_occupants` and `_description` when there are at most 20 rooms.
- Per-room notification rule: `localStorage` key `hey-postie:<account bare JID>:room-notify:<room JID>`
  (`room-notify.ts`), a preference, not a secret; a model attribute would die with `close()`.

### Pitfalls found

- MockConnection: a room's `join()` awaits a disco#info on the room (30 s timeout) and Converse's
  member-list IQs after entering; `room.test.ts` answers every IQ to the service for the whole file.
  While those IQs are pending, `onRoomEntered` has not called `fetchMessages()` yet and
  `queueMessage` dereferences `messages.fetched` (`model-with-messages.js:269`): a message arriving
  in that window is dropped with a TypeError. Narrow in production (a server answers at once), but
  the reason the mock test must answer the affiliation IQs.
- Prosody: a room created by a plain join is **locked** until its owner accepts the configuration;
  other users get `item-not-found` meanwhile (XEP-0045 §10.1.1). Converse does this itself
  (`muc_instant_rooms`, status code 201); `bobClient.joinRoom` does it by hand. New rooms are also
  hidden from the service's disco#items (`publicroom` off by default): `contract-rooms.test.ts`
  browses a room that bob configured public.
- The own occupant's JID comes from the self-presence `<item jid=…>`; without it `getOwnOccupant()`
  finds nothing and `fetchMembers()` returns early.
- A MUC's `clearUnreadMsgCounter()` is async (it sends a marker first): `markRead` awaits it.
- Advertising PEP in the mock wakes OMEMO, which loads libomemo's wasm: `MockHarness` serves the
  package assets through `fetch` like the contract environment does (`contractEnv.ts`).
- Unhandled rejections kill the Vitest worker (exit code 7, §11). Stale `autojoin` bookmarks left by
  an aborted run made Converse rejoin dead rooms at the next sign-in and crashed `contract.test.ts`
  that way; the rooms suite now removes its bookmark in `afterAll`. Purging alice's
  `urn:xmpp:bookmarks:1` node by hand fixed the server state.

### Points to check

- `contract.test.ts` cases 4 and 5 (send to bob, MAM catch-up) fail on the current test server
  state, on this branch **and** on `feat/m2-contracts` (checked on 2026-10-15 from a throwaway
  worktree; case 4 times out, the worker sometimes exits with code 7). The rooms suite passes.
  Likely server-side accumulation across runs (every run publishes a new OMEMO device to PEP);
  not investigated further here.

## 15. Parcels and reactions: what the repository does

_Implementation of 2026-10-16, `upload.ts`, `reactions.ts`, `file.ts` and the `sendFile` /
`maxFileSize` / `react` methods of `chat.ts`; verified by `parcel.test.ts` (mock connection, PUT
through `test-support/fakeXhr.ts`), `file.test.ts` (WebCrypto fixture, `fetch` stubbed) and
`parcel.contract.test.ts` against the local Prosody._

- **Upload limit** (`maxFileSize`): `api.disco.features.get(Strophe.NS.HTTPUPLOAD, domain)` returns
  the entities (server and its disco#items) that advertise upload; the limit is the `max-file-size`
  field of the data form whose `FORM_TYPE` is the upload namespace (`model-with-messages.js:433-447`
  does the same). Cached per connection (`disconnected` clears it); `null` when the server has no
  upload component or announces no limit. Pitfall found in the mock test: Converse only queries the
  server's disco#items when its disco#info advertises `http://jabber.org/protocol/disco#items`
  (`plugins/disco/entity.js:242`); a server answer without that feature yields no upload service.
- **Upload** (`sendFile`): the limit is checked first so that the caller gets `FileTooLarge`
  (Converse's own check only produces an ephemeral `type: 'error'` message). Then
  `chat.sendFiles([file])` (`model-with-messages.js:432-495`): Converse creates a placeholder message
  with `file: true`, `progress` 0..1 (triggered manually as `add` on `chat.messages`), requests the
  slot, PUTs through `XMLHttpRequest` (`shared/message.js:270-328`; `Content-type` and the slot's
  `Authorization`/`Expires` headers), saves `upload: 'success'` with `body` = `oob_url` = the GET URL,
  and `onMessageUploadChanged` sends a *second* message with that body and destroys the placeholder.
  `upload.ts` listens on the collection: `change:progress` → `onProgress`, `change:upload` success →
  remembers the URL and resolves with the next added model whose text (`plaintext` or `body`) is that
  URL; `upload: 'failure'` or an ephemeral error (slot refused, upload unsupported) → `Unknown`;
  2 minutes → `ServerUnreachable`. Placeholders are never displayable (`isDisplayable` drops
  `file: true`), so the chat list and `messages()` do not show an empty message while uploading.
  Converse parses no file size anywhere (no XEP-0447), so the mapper leaves `size: 0` and `sendFile`
  stamps the size of the uploaded `File` on the returned attachment.
- **Encrypted upload**: in a chat with `omemo_active`, the `beforeFileUpload` hook encrypts the file
  (AES-256-GCM, 12-byte IV, `plugins/omemo/utils.js:1206-1215`) and `afterFileUploaded` rewrites the
  body to `aesgcm://host/path#<hex iv><hex key>` with `oob_url: null`; `getOutgoingMessageAttributes`
  then moves that body to `plaintext`. The mapper reads `plaintext || body`, so the sent `Message`
  carries one attachment with `encryption: 'aesgcm'`, `decryptionKey` set and a URL without fragment.
  **Not exercised end to end** (checked on 2026-10-16): the mock has no OMEMO sessions and bob's
  hand-written client has no OMEMO; the mapping is unit-tested on a fixture body.
- **Body of an upload**: a message whose text is only the attachment's URL gets `body: ''`
  (`mappers.ts` `isOnlyUrl`); a caption with an `oob_url` keeps its text.
- **Download** (`file.ts`, `ConverseFileRepository`, no Converse code involved): `fetch()` over
  `https:` only (`aesgcm:` is rewritten to `https:`, plain `http:` is refused), no redirects,
  `Content-Length` above 200 MB aborts before reading, the bytes are checked again after reading.
  `aesgcm` attachments are decrypted with WebCrypto: `decryptionKey` is hex(iv) + hex(key) with a
  32-byte key, so the IV is whatever precedes the last 64 hex characters (12 or 16 bytes; Converse
  writes 12). The tag sits at the end of the ciphertext, as WebCrypto's `encrypt` leaves it. Blobs
  are cached by URL (50 entries, oldest dropped). Every failure is `DomainError('Unknown')` with a
  code-first message and no URL in it.
- **Reactions** (`react`, `reactions.ts`): the stanza of §6, same as Converse's UI plugin
  (`src/plugins/reactions-views/utils.js` `sendReaction`, read on GitHub master 2026-10-15): target
  id = `msgid`, or the room's `stanza_id` in a room (fallback `msgid`), `<store/>` hint, type
  `chat`/`groupchat`. Sealed chat: `api.omemo.send(chat, fallbackBody, [reactionsEl, fallbackEl])`
  with the emojis as fallback body (no body when removing). Our own stanza is not echoed back in a
  direct chat, so the repository saves `{ ...reactions, [ownKey]: emojis }` on the model (key from
  `u.reactions.getOwnReactionJID(chat)`: bare JID, or occupant id / address in a room), which fires
  `change:reactions` → `onMessageUpdate`. Incoming reactions are merged by Converse
  (`plugins/reactions/utils.js` `getUpdatedMessageAttributes`), a stanza with an empty list removes
  the sender's key. `urn:xmpp:reactions:0` is advertised at `addClientFeatures`. The mapper sorts
  `Reaction[]` by emoji.
- **Model typings** (`models.ts`): `ChatModel.sendFiles`, `api.disco.features.get` /
  `api.disco.own.features.add`, `api.send`, `api.omemo.send` (optional: present once the plugin
  loaded), `Strophe.NS`, `u.getUniqueId`, `u.reactions.getOwnReactionJID`.

### Contract test (`parcel.contract.test.ts`)

Same preamble as [§12](#contract-test). The engine's `fetch` is the asset stub, so the test keeps
Node's `fetch` from before `prepareContractEnvironment()` and routes `localhost:5281` URLs to it.
Four scenarios: `maxFileSize()` is 10 MB (`http_file_share_size_limit`); alice uploads a text file,
bob receives a message whose `<body>` and `<x xmlns="jabber:x:oob"><url>` are an
`https://upload.localhost:5281/file_share/...` URL, and `core.files.fetch` downloads the same bytes;
a file above the limit is refused before any IQ; bob's reaction stanza to alice's message shows up
through `onMessageUpdate`, and alice's `toggleReaction` reaches bob as a `<reactions>` stanza.
Observed on 2026-10-16:

- Prosody delivers a bare-JID `chat` message to the resources with the **highest** priority only.
  Another session signed in as `bob@localhost` (an agent's Converse, resource `v9_9zzoDGlC_`, smacks
  on) was online at the same time and received alice's messages instead of the test's bob, whose
  default priority is 0: nothing arrived, no error. The test's bob now sends `<priority>10</priority>`.
  The shared accounts remain a hazard for every contract suite.
- The upload scenario needs the server's certificate to cover `upload.localhost`: `mod_http_file_share`
  hands out `https://upload.localhost:5281/file_share/...` (routing is by `Host`, so the URL cannot be
  rewritten to `localhost`), and the mkcert certificate had SANs `localhost, 127.0.0.1, ::1` only →
  `ERR_TLS_CERT_ALTNAME_INVALID` in Node, same in the webview, and Converse's XHR failure surfaced as
  `Unknown: upload failed`. Fixed the same day by regenerating the certificate with `upload.localhost`
  and `rooms.localhost` ([tools/xmpp-server](../../tools/xmpp-server/README.md)); all four scenarios
  pass since. CORS needs nothing: Prosody 13 enables it by default
  (`http_default_cors_enabled`) and `mod_http_file_share` declares its own.
- jsdom's `XMLHttpRequest` enforces CORS (preflight for the cross-origin PUT) and reports upload
  progress; Converse's XHR path runs unchanged under Vitest.
