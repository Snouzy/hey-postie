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
`aesgcm://` on receipt: the repository does.** There is no `api.upload`.

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
and SASL included); at `warn`, stanzas with bodies are still logged on parse errors and when
sending while disconnected. Our wrapper keeps `warn` in production and never forwards stanzas.

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
