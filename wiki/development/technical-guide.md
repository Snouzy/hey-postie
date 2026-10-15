# Technical guide

_Created 2026-10-15. Updated as the code grows; each section names the files it describes._

## The tree

```
packages/core/     the engine, TypeScript, no React
  src/contracts/   types, errors, events, repository and service interfaces
  src/services/    business rules; depend on repository interfaces only
  src/repositories/ implementations: converse/ (XMPP, roster, chats, rooms, registration), tauri/ (keychain, transport, notifier)
  src/fakes/       in-memory repositories for tests and for the UI in development
  src/container.ts createCore(deps): the single place where everything is wired
packages/ui/       React: theme/, i18n/, illustrations/, screens/, components/
apps/desktop/      Tauri 2: app/ (Vite entry, Tauri-backed repositories), src-tauri/ (Rust)
wiki/              this documentation
tasks/             agents' plans and lessons, untracked
```

## The three layers, with one example each

- **Presentation**: `packages/ui/src/screens/Welcome.tsx` renders Postie and two buttons. It gets the
  core through `useCore()` and never imports Converse, Tauri or storage.
- **Service**: `packages/core/src/services/accounts.ts` validates the JID, decides whether to keep
  the password, asks the transport for a URL and the XMPP repository to connect, and translates
  failures into `DomainError`s. `chats.ts` trims and sanitizes message bodies and keeps the paging
  cursor for older history; `contacts.ts` sorts the roster; `notifications.ts` decides when a
  system notification is shown (window not focused, or another chat open; in a room, the room's
  rule: all, mentions only, none); `rooms.ts` validates room JIDs and nicks, bookmarks on join.
- **Persistence**: `apps/desktop/app/repositories/keychain.ts` calls the Rust `keychain_*` commands;
  `packages/core/src/fakes/keychain.ts` keeps a `Map` in memory for tests.
  `packages/core/src/repositories/converse/` wraps `@converse/headless`: `engine.ts` owns the one
  Converse instance, `xmpp.ts`, `roster.ts`, `chat.ts`, `room.ts` and `registration.ts` (XEP-0077 over a bare
  Strophe connection, plus account deletion and local wipe) implement the repository contracts,
  `mappers.ts` turns Converse models into the plain types of `contracts/`. `createConverseRepositories()`
  (exported by `@hey-postie/core`) wires them over one engine; `apps/desktop/app/dependencies.ts`
  calls it. Details and pitfalls: [converse.md](converse.md).

## Run and verify

| Command | What |
|---|---|
| `pnpm desktop:dev` | Opens the app with Vite hot reload. |
| `pnpm desktop:smoke` | Debug build, starts the app with `--smoke`, exits 0 when the webview has rendered. |
| `pnpm desktop:smoke:login` | The same, plus a real sign-in as `alice` on the local Prosody (see the Desktop section). |
| `pnpm check` | TypeScript, every package. |
| `pnpm lint` | Biome (lint and format). `pnpm lint:fix` writes the fixes. |
| `pnpm test` | Vitest, every package. |
| `pnpm rust` | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` in `apps/desktop/src-tauri`. |
| `pnpm licenses` | Regenerates `packages/ui/src/data/licenses.json` from the dependency trees (see [dependencies.md](dependencies.md)). |
| `pnpm verify` | All of the above, then the Vite build. Must be green before a pull request. |

## Test server

A local Prosody 13 server, bound to `localhost` only, for development and for the contract tests
gated by `XMPP_TEST_SERVER`: see [`tools/xmpp-server/README.md`](../../tools/xmpp-server/README.md)
(install, start/stop, test accounts `alice@localhost` and `bob@localhost`, ports, certificates).

  src/repositories/ implementations: converse/ (XMPP, roster, chats, rooms, registration), tauri/ (keychain, transport, notifier)

```sh
tools/xmpp-server/start.sh -d && tools/xmpp-server/users.sh
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" pnpm --filter @hey-postie/core test:contract
```

`NODE_EXTRA_CA_CERTS` is required: the test opens the `wss://` socket from Node, which does not read
the macOS keychain where `mkcert -install` put the CA. Plain `pnpm test` skips the file.

## Add a service

1. Write its interface in `contracts/services.ts` and the repository interfaces it needs in
   `contracts/repositories.ts`. If a contract changes, that change is its own pull request, merged first.
2. Write the fake repository in `fakes/`.
3. Write the service's tests against the fakes, then the service.
4. Wire it in `container.ts`.
5. Write the real repository (Converse or Tauri) and, when it talks to a server, a contract test
   gated by `XMPP_TEST_SERVER`.
6. Update this guide or the feature's wiki page in the same commit.

## Dependencies

Every new dependency is a decision: name, license, why, in the feature's spec and in
[dependencies.md](dependencies.md). Licenses must be compatible with AGPL-3.0 and with app-store
distribution. Only one session at a time adds or upgrades dependencies.

## Desktop

_Checked on 2026-10-15 against Tauri 2.12.4, `tauri-plugin-notification` 2.7.0,
`tauri-plugin-deep-link` 2.6.2, `tauri-plugin-single-instance` 2.5.4, `tauri-plugin-opener` 2.7.2,
`tauri-plugin-dialog` 2.8.3, on macOS. Windows and Linux are assumed from the crates' docs._

- The Rust side lives in `apps/desktop/src-tauri/src/`: `lib.rs` registers plugins, commands and
  window events; `keychain.rs` wraps the `keyring` crate (macOS Keychain, Windows Credential
  Manager, Linux Secret Service; `KeychainUnavailable` when none works); `tray.rs`, `links.rs`,
  `window.rs`, `save.rs`, `i18n.rs` are described below; `smoke.rs` implements `--smoke`.
- macOS entitlements (`src-tauri/Entitlements.plist`): app sandbox, network client, user-selected
  files. They are on from the first build so that the App Store build is the same build.

### The XMPP relay (`src-tauri/src/relay/`)

Converse (through Strophe.js) only speaks XMPP over WebSocket (RFC 7395); most servers only
speak XMPP over TCP with TLS (RFC 6120). The relay is a tiny local WebSocket server that
translates between the two, so the webview never opens a raw socket. Design:
[version 1 design](../specs/2026-10-15-hey-postie-v1-design.md), section 2.3. Checked against
the code on 2026-10-15.

| File | Role |
|---|---|
| `relay/mod.rs` | `start()`: binds `127.0.0.1:0` (a free port), draws a 32-byte random token, serves on Tauri's async runtime. `RelayError`: the three close reasons. The `RELAY_DEBUG` logger. |
| `relay/server.rs` | Accepts WebSockets: a path other than `/xmpp/<token>` is answered `404` and dropped; the handshake has 10 s; at most 8 sessions at a time; frames are capped at 8 MiB. |
| `relay/bridge.rs` | Session setup: waits for the client's `<open/>` (10 s), resolves, connects while still watching the WebSocket (a webview that leaves aborts the attempts), then hands over to `pump`. |
| `relay/connect.rs` | Tries the candidates in order (10 s each); STARTTLS negotiation; then `tls`. |
| `relay/pump.rs` | The two directions as two futures polled together, so a slow peer on one side never blocks reads from the other. Gates stream restarts behind `<success/>`; reports `<stream:error>` as `StreamError`. |
| `relay/framing.rs` | WS ↔ stream translation: `<open/>` ↔ `<stream:stream>` (carrying `to`, `version`, `xml:lang`), `<close/>` ↔ `</stream:stream>`; each server element becomes a stand-alone document (`xmlns="jabber:client"` or `xmlns:stream` declared when missing). Refuses client frames that contain stream-level markup. |
| `relay/framing/splitter.rs` | Cuts the TCP bytes into top-level elements, tolerant of elements split across reads. A hand-written state machine (tags with a name stack, quotes, comments, CDATA, PI), not a full parser: the bytes are forwarded untouched. |
| `relay/resolve.rs` | SRV lookup (5 s) and RFC 2782 ordering (priority, then weighted random). |
| `relay/tls.rs` | `rustls` client with the OS root store; SNI and verification use the XMPP domain. |
| `relay/test_support.rs` | A scripted TCP server standing in for an XMPP server in the tests. |

**Handshake with the webview.** The `relay_url` command (`lib.rs`) returns
`ws://127.0.0.1:<port>/xmpp/<token>`. The token is the only guard: another local process cannot
guess it, and the server only listens on the loopback interface. The URL changes at every launch.

**Connection order** for a domain, each attempt with a 10 s timeout:

1. `_xmpps-client._tcp.<domain>` SRV records (direct TLS, XEP-0368), by priority then weight;
2. `_xmpp-client._tcp.<domain>` SRV records (STARTTLS), same order;
3. without any SRV record (or when DNS does not answer in 5 s): `<domain>:5223` (direct TLS)
   then `<domain>:5222` (STARTTLS). A domain whose SRV records point to `.` says "no XMPP here"
   (RFC 6120 section 3.2.1): no fallback, `ServerUnreachable`.

A refused certificate (any `rustls` certificate error) stops the search at once, since moving on
to another candidate is what an attacker on the path wants, and closes the WebSocket with reason
`CertificateInvalid`. One exception: with guessed candidates (step 3), 5223 may host anything, so
a certificate problem there still leads to 5222; both are TLS with the same verification. Other
failures try the next candidate; when none is left the reason is `ServerUnreachable`. A protocol
problem (bad XML, STARTTLS not offered, the first frame is not `<open/>`, a restart before
`<success/>`, stream markup inside a frame, a `<stream:error>` from the server) is `StreamError`.
The client sees only that reason, never a payload.

**Framing.** Client → server: an `<open/>` frame becomes a `<stream:stream>` header (also after
SASL, when Strophe restarts the stream), `<close/>` becomes `</stream:stream>`, anything else is
written as is. Server → client: the header becomes `<open from id xml:lang/>`, each complete
top-level element becomes one text frame that parses on its own (RFC 7395 section 3.3.3:
`<message>` gets `xmlns="jabber:client"`, `<stream:features>` gets `xmlns:stream`, elements with
their own `xmlns` such as SASL and stream management are untouched), `</stream:stream>` becomes
`<close/>` then a normal WebSocket close.

**Debugging.** `RELAY_DEBUG=1 pnpm desktop:dev` prints the relay's events to stderr: candidates
tried, bytes per direction, element kinds, close reasons. Never frame contents. The ignored
integration test opens a real stream through the relay:

```
XMPP_TEST_DOMAIN=example.org RELAY_DEBUG=1 cargo test relay -- --ignored --nocapture
```

It expects an `<open/>` frame then a `<stream:features>` frame. Verified on 2026-10-15 against
`jabber.org` (SRV, STARTTLS on 5222) and `conversations.im` (SRV, direct TLS on 443). The other
tests need no network: `pump/tests.rs` and `connect/tests.rs` run a full WebSocket session,
STARTTLS negotiations and a self-signed certificate rejection against local fake servers.
- Content Security Policy (`tauri.conf.json`, `app.security.csp`): `script-src 'self'
  'wasm-unsafe-eval'` and `worker-src 'self'` because `@converse/headless` loads libomemo as a
  lazy chunk plus a WebAssembly module (`/curve25519_compiled.wasm`); `connect-src` allows the
  local relay (`ws://127.0.0.1:*`) and `https:` for HTTP upload hosts (XEP-0363); the desktop
  app always connects through the relay, so no `wss://`. No `unsafe-inline` for scripts, no `unsafe-eval`.
- The webview reaches Rust through the repositories in `apps/desktop/app/repositories/` and the
  small modules in `apps/desktop/app/`, started once by `app/desktop.ts` when the page runs inside
  Tauri (`isTauri()`); in a plain browser (`pnpm app:dev`) none of this runs.
- **A browser on `http://localhost:1420` renders the interface but cannot sign in**: there is no
  relay and no keychain there. `TauriTransport` answers `ServerUnreachable` and `TauriKeychain`
  `KeychainUnavailable` at once (observed on 2026-10-15: before that guard, the failed `invoke`
  read as `Unknown`, "Something went wrong on my round"). Use the Tauri window (`pnpm desktop:dev`).

### End-to-end smoke sign-in (`src-tauri/src/smoke.rs`, `app/smoke.ts`)

`pnpm desktop:smoke` proves the shell boots. With credentials it also proves the whole sign-in
path, relay and Converse included, against the local Prosody of `tools/xmpp-server/`, without a
human clicking:

```sh
tools/xmpp-server/start.sh -d && tools/xmpp-server/users.sh
pnpm --filter @hey-postie/desktop smoke:login
# = HEY_POSTIE_SMOKE_LOGIN=alice@localhost:alice-pw RELAY_DEBUG=1 pnpm smoke
```

- `HEY_POSTIE_SMOKE_LOGIN="jid:password"` is read in debug builds only and only with `--smoke`
  (`smoke::login_from_env`); release builds ignore it. The `smoke_login` command hands the pair
  to the webview.
- `app/smoke.ts` then calls `core.accounts.signIn({ remember: false })` (the keychain is left
  alone) and emits `smoke-online` once `accounts.current().state` is `online`, or `smoke-failed`
  with the `DomainError` code. Rust exits 0 or 1 accordingly, or 1 after 40 s. The plain
  `smoke-ready` exit is kept when no login is given.
- `smoke-log` events (the sign-in error with its chain of causes, `window.onerror`, unhandled
  rejections) are printed to stderr as `smoke: webview …`: error names, codes and messages only,
  never a stanza or a message body. `RELAY_DEBUG=1` adds the relay's own lines (byte counts).
- Observed on 2026-10-15 at `24d7946`, both from the built app and through the Vite dev server
  (`pnpm tauri dev -- -- --smoke` with the same variable): `relay DEBUG: trying port 5223 with
  DirectTls`, `server opens the stream`, `client restarts the stream`, `server opens the stream`,
  then `smoke: signed in, the account is online`. The same with `remember: true`.
- Why it exists: on 2026-10-15 a manual sign-in reported "Unknown". The smoke run cleared the
  relay, TLS trust, keychain, dev-server and Converse paths one by one; the cause was a browser
  tab on `localhost:1420` instead of the Tauri window (see the note above). The run stays as the
  regression gate for the whole sign-in path.

### Transport (`app/repositories/transport.ts`)

`TauriTransport.websocketUrlFor()` asks the Rust command `relay_url` once and caches the answer:
`ws://127.0.0.1:<port>/xmpp/<token>`. The relay reads the XMPP domain from the first
`<open to="…"/>` frame, so the URL does not depend on the domain. A failed call becomes `ServerUnreachable` and the
cache is cleared, so the next sign-in tries again.

### Notifications (`app/repositories/notifier.ts`, `app/notificationClicks.ts`)

- `TauriNotifier.show` checks `isPermissionGranted()`, asks `requestPermission()` once per run if
  needed, then `sendNotification({ title, body, extra: { chatId } })`. A refused permission is
  silent: the message still shows in the window.
- A click opens the chat: `onAction` of the plugin reports a click (`actionId: 'tap'`) with the
  notification's `extra` on desktop too (verified in the plugin's `src/desktop.rs`, 2.7.0: macOS
  and Windows wait on `notify-rust`'s response; Linux listens on D-Bus). `openChatOnNotificationClick`
  registers that listener at startup, because the plugin only reports clicks on notifications shown
  while a listener existed. On a click it brings the window to front (`app/window.ts`) and emits
  `chat.requested` with the chat id. Nothing about the message is logged.
- Known limits (plugin docs): on Windows a click is reported only while the toast is on screen,
  not from the Action Center. In `tauri dev` on macOS, notifications are sent in the name of the
  terminal app, since the binary is not a bundle.

### Window focus (`app/focus.ts`)

`trackWindowFocus` feeds `core.notifications.setWindowFocused` from the Tauri window's
`onFocusChanged`, from `document.visibilitychange` (a hidden window counts as not focused), and
once at startup from `isFocused()`.

### Tray, badge, close-to-tray (`src-tauri/src/tray.rs`, `window.rs`, `app/unread.ts`)

- `tray.rs` builds one tray icon (feature `tray-icon`) with the window icon and a menu:
  "Open Hey Postie" (show, unminimize, focus) and "Quit" (`app.exit(0)`). The texts come from
  `i18n.rs`: the tray lives in Rust, outside the interface's dictionaries, so the two languages are
  there. `language_from_locale` reads the primary tag of the system locale (`sys-locale` crate:
  `fr`, `fr-FR`, `fr_CA.UTF-8` → French, anything else → English; unit tests in the module); the
  result is picked once at startup and kept in Tauri state. Not tested by hand on a French Mac
  yet: the picker is unit-tested, the system locale read is the crate's.
- The command `set_unread_count(count)` sets the tooltip ("Hey Postie: 3 unread" / "Hey Postie :
  3 non lus"), the text next to
  the icon on macOS (`set_title`), and the badge of the main window (`WebviewWindow::set_badge_count`:
  the dock on macOS, the launcher on Linux; Tauri documents it as unsupported on Windows, so it is
  not called there). `0` clears everything. `app/unread.ts` calls it at startup and on every
  `chat.updated`, with the sum of `unreadCount` over `core.chats.list()`.
- Closing the window hides it on macOS and Windows (`on_window_event`, `CloseRequested` →
  `prevent_close` + `hide`); the app stays in the tray. "Quit" and Cmd+Q (the default macOS
  menu) exit. On Linux, where a tray is not guaranteed, closing quits. On macOS a click on the
  dock icon while the window is hidden brings it back (`RunEvent::Reopen`).
- The tray icon is the colored app icon, not a monochrome template: it looks fine on light menu
  bars, less so on dark ones. Open point for the design pass.

### `xmpp:` links (`src-tauri/src/links.rs`, `app/links.ts`)

- The scheme is declared in `tauri.conf.json` (`plugins.deep-link.desktop.schemes: ["xmpp"]`); the
  bundler writes it in the macOS `Info.plist` and the Windows registry / Linux `.desktop` entry.
  Registration therefore exists only in a bundled build, not in `tauri dev`.
- Rust: `links::arm` listens to the plugin's `on_open_url`, keeps the URLs with the `xmpp` scheme,
  shows the window and emits the Tauri event `xmpp-link` with the URL string. The URL holds a JID
  and is never logged. The JavaScript package of the plugin is not needed: the event comes through
  `@tauri-apps/api/event`, and the link the app was started with is read through
  `invoke('plugin:deep-link|get_current')` (permission `deep-link:default`).
- TypeScript: `jidFromXmppLink` keeps the bare JID of `xmpp:user@domain?…` and of
  `xmpp://auth/user@domain`, normalized by `normalizeJid`; the query (`?message;body=…`) is ignored
  (unit tests in `app/links.test.ts`). `openChatsFromXmppLinks` then calls `core.chats.open(jid)`
  and emits `chat.requested`. If no account is signed in, `open` fails and the link is dropped with
  a warning (error code only).
- On Windows and Linux the OS starts a second instance with the link as argument;
  `tauri-plugin-single-instance` (feature `deep-link`), registered first in `lib.rs`, forwards the
  arguments to the deep-link plugin of the running app (so `on_open_url` fires as usual), shows the
  window, and the second process exits before it builds anything. macOS already routes links to the
  running app; the plugin's macOS side (a Unix socket, read in `platform_impl/macos.rs` of 2.5.4)
  only prevents two copies of the app. Consequence for `--smoke`: a smoke run while another Hey
  Postie (for example `pnpm desktop:dev`) is open exits 0 at once without rendering anything, since
  it is the second instance; quit the other app first. `smoke.rs` calls
  `tauri_plugin_single_instance::destroy` before `process::exit`, which skips `RunEvent::Exit`,
  so no stale socket is left behind. Not tested on Windows or Linux.

### Links in messages (`app/openLink.ts`)

`App`'s `onOpenLink` prop (`packages/ui/src/App.tsx`) receives `openLinkInBrowser` from
`main.tsx` when the page runs inside Tauri. It keeps `http:`, `https:` and `mailto:` only
(`isOpenableLink`, unit-tested: `javascript:`, `file:`, `data:`, `xmpp:` are refused and nothing
of the URL is logged) and calls `openUrl` of `@tauri-apps/plugin-opener`. The capability
`opener:allow-open-url` (`capabilities/default.json`) repeats the list on the Rust side, so the
webview could not open another scheme even if the TypeScript check were bypassed. In a plain
browser `App` falls back to `window.open`.

### Save a file (`app/saveFile.ts`, `src-tauri/src/save.rs`)

`App`'s `onSaveFile(blob, name)` prop receives `saveFileToDisk`. Decision of 2026-10-15: the
save panel and the write happen in Rust, not through `@tauri-apps/plugin-dialog` + `plugin-fs`
from the webview, because then no path ever crosses the IPC (the webview cannot ask to write
anywhere else, so no `fs` scope to maintain) and it is the sandbox-friendly path: in the macOS
sandbox the save panel (powerbox) grants the write to the file the user picked, with the
entitlement `files.user-selected.read-write` already in `Entitlements.plist`.

- TypeScript sends the bytes as the raw IPC body (`invoke('save_file', Uint8Array, { headers })`)
  and the suggested name percent-encoded in the `x-file-name` header, after refusing blobs above
  200 MB so the bytes are never sent.
- Rust (`save::save`): `InvokeBody::Raw` only; the cap again (`MAX_BYTES`, 200 MiB; the body sits
  in memory twice: `Request` borrows it, the write needs its own copy); the name decoded and
  reduced to a bare file name (`Path::file_name`, no `..`, no separators); `tauri-plugin-dialog`'s
  `save_file` with that name, awaited through a oneshot channel (the plugin opens the panel on the
  main thread); `std::fs::write` on a blocking thread. Returns `true` when written, `false` when
  cancelled; errors are codes (`FileTooLarge`, `NoFileName`, `Io: …`), never the name or the bytes.
- Verified on 2026-10-15: unit tests of the cap and the name handling; the whole path (panel,
  write) needs a hand on the panel and is not covered by `--smoke`. Not yet exercised in a signed,
  sandboxed bundle.

### Licenses (`apps/desktop/scripts/licenses.mjs`)

`pnpm licenses` writes `packages/ui/src/data/licenses.json`, the data of the "Licenses" dialog
(dialog not built yet). Sources and format: [dependencies.md](dependencies.md), "The licenses
file". Rerun it in the same commit as a dependency change.

### Still open on the desktop side

- `tauri-plugin-autostart` (launch at login).
- `chat.requested` is emitted by the shell; the interface listens to it (milestone 1, UI).
- The default-window-icon tray icon (template icon for macOS dark menu bars).
- Single instance and `xmpp:` links on Windows and Linux: written from the crates' docs, not run.
