# Technical guide

_Created 2026-10-15. Updated as the code grows; each section names the files it describes._

## The tree

```
packages/core/     the engine, TypeScript, no React
  src/contracts/   types, errors, events, repository and service interfaces
  src/services/    business rules; depend on repository interfaces only
  src/repositories/ implementations: converse/ (XMPP, roster, chats, rooms, OMEMO, registration, files), tauri/ (keychain, transport, notifier)
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
  Converse instance; `xmpp.ts`, `roster.ts`, `chat.ts` (with `upload.ts` for XEP-0363 and
  `reactions.ts` for XEP-0444), `room.ts`, `crypto.ts` (OMEMO devices and trust over Converse's
  device lists, with `crypto-lists.ts`), `registration.ts` (XEP-0077 over a bare Strophe
  connection, plus account deletion and local wipe) and `file.ts` (attachment download and
  `aesgcm` decryption with WebCrypto, no Converse code) implement the repository contracts;
  `mappers.ts`, `room-mappers.ts` and `crypto-mappers.ts` turn Converse models into the plain
  types of `contracts/`. `createConverseRepositories()` (exported by `@hey-postie/core`) wires them
  over one engine; `apps/desktop/app/dependencies.ts` calls it. Details and pitfalls:
  [converse.md](converse.md).

## Run and verify

| Command | What |
|---|---|
| `pnpm desktop:dev` | Opens the app with Vite hot reload, labelled with its worktree (see "Dev windows" below). |
| `pnpm desktop:smoke` | Debug build, starts the app with `--smoke`, exits 0 when the webview has rendered. |
| `pnpm desktop:smoke:login` | The same, plus a real sign-in as `alice` on the local Prosody (see the Desktop section). |
| `pnpm desktop:smoke:scenario` | The scripted end-to-end scenario in the real app: `alice` in the Tauri window, `bob` from Node, direct and room messages both ways, a server restart and the reconnection (see the Desktop section). |
| `pnpm check` | TypeScript, every package. |
| `pnpm lint` | Biome (lint and format). `pnpm lint:fix` writes the fixes. |
| `pnpm test` | Vitest, every package. |
| `pnpm rust` | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` in `apps/desktop/src-tauri`. |
| `pnpm run licenses` | Regenerates `packages/ui/src/data/licenses.json` from the dependency trees (see [dependencies.md](dependencies.md)). `run` is needed: `pnpm licenses` alone is pnpm's own built-in command. |
| `pnpm verify` | All of the above, then the Vite build. Must be green before a pull request. |
| `pnpm --filter @hey-postie/desktop app:dev`, then `/preview.html` | The interface on fakes (`apps/desktop/app/preview.tsx`): a few contacts, chats and a hall, no network. `?theme=dark`, `?signin=1`, `?click=Add\|New chat` (clicks in order, by aria-label or text). Dev server only, never in the app bundle. |
| `apps/desktop/scripts/preview-shots.sh <port> <dir>` | Screenshots of the preview, light and dark, through headless Chrome: take a set before a UI change and one after, then compare (ImageMagick: `compare -metric AE a.png b.png null:`). |
| `pnpm version:set <x.y.z>` | Writes the version in `tauri.conf.json`, `Cargo.toml`, `Cargo.lock` and the three `package.json` (`scripts/version-set.mjs`). |
| `pnpm desktop:build` | `tauri build`: the installers and updater artifacts for the current platform; needs `TAURI_SIGNING_PRIVATE_KEY` (see [release.md](../product/release.md)). |
| `pnpm release:build` | `pnpm verify && pnpm desktop:build`. |

## Test server

A local Prosody 13 server, bound to `localhost` only, for development and for the contract tests
gated by `XMPP_TEST_SERVER`: see [`tools/xmpp-server/README.md`](../../tools/xmpp-server/README.md)
(install, start/stop, test accounts `alice@localhost` and `bob@localhost`, ports, certificates).

  src/repositories/ implementations: converse/ (XMPP, roster, chats, rooms, registration, files), tauri/ (keychain, transport, notifier)

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
`tauri-plugin-dialog` 2.8.3, on macOS; on 2026-10-16 for `tauri-plugin-updater` 2.14.0 and
`tauri-plugin-process` 2.4.0. Windows and Linux are assumed from the crates' docs._

- The Rust side lives in `apps/desktop/src-tauri/src/`: `lib.rs` registers plugins, commands and
  window events; `keychain.rs` wraps the `keyring` crate (macOS Keychain, Windows Credential
  Manager, Linux Secret Service; `KeychainUnavailable` when none works); `tray.rs`, `links.rs`,
  `window.rs`, `save.rs`, `i18n.rs` are described below; `smoke.rs` implements `--smoke`.
- macOS entitlements (`src-tauri/Entitlements.plist`): app sandbox, network client, user-selected
  files. They are on from the first build so that the App Store build is the same build.

### Dev windows (`scripts/dev.mjs`, `src-tauri/.cargo/config.toml`)

Many sessions work at once, one worktree each, and the author watches their work live. So
`pnpm desktop:dev` (decision of 2026-10-16):

- **Says which worktree it shows.** The window title is `Hey Postie · <worktree> · <branch>`, a
  yellow `DEV · <worktree> · <branch>` ribbon sits in the bottom-right corner
  (`packages/ui/src/components/DevRibbon.tsx`, through `VITE_DEV_LABEL`, which only `dev.mjs`
  sets: never in a build), and the terminal prints it. The repository itself reads `main checkout`.
  The Dock keeps the binary's name, `hey-postie`.
- **Takes its own Vite port**, the same for a given worktree on every run (1420 plus a hash of its
  name, the next free one if taken), so two dev servers never clash.
- **Warns when the installed app runs**: one instance at a time (`tauri-plugin-single-instance`),
  the dev window would hand over to it and quit. Quit the installed app first.
- **Signs the debug binary on macOS** before running it (`src-tauri/scripts/dev-sign-run.sh`, the
  Cargo runner of `.cargo/config.toml`): the keychain ties "Always Allow" to the signer, not to the
  binary's hash, so after one "Always Allow" a rebuild or another worktree no longer asks for the
  password. The identity is `HEY_POSTIE_DEV_IDENTITY`, else the first "Apple Development" one of the
  login keychain; without any, the binary runs unsigned as before. Its signing identifier is
  `com.snouzylabs.heypostie.dev`. Release builds (`tauri build`) never go through the runner.

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
| `relay/bridge.rs` | Session setup: waits for the client's `<open/>` (10 s), checks that its `to` is a domain TLS can verify (`tls::server_name`: an ASCII host name or an IP literal, else `StreamError` before any DNS or TCP work; unicode domains must be given in punycode, decision of 2026-10-16: no `idna` dependency in version 1), resolves, connects while still watching the WebSocket (a webview that leaves aborts the attempts), then hands over to `pump`. |
| `relay/connect.rs` | Tries the candidates in order (10 s each); STARTTLS negotiation; then `tls`. |
| `relay/pump.rs` | The two directions as two futures polled together, so a slow peer on one side never blocks reads from the other. Gates stream restarts behind `<success/>`; reports `<stream:error>` as `StreamError`. |
| `relay/framing.rs` | WS ↔ stream translation: `<open/>` ↔ `<stream:stream>` (carrying `to`, `version`, `xml:lang`), `<close/>` ↔ `</stream:stream>`; each server element becomes a stand-alone document (`xmlns="jabber:client"` or `xmlns:stream` declared when missing). Refuses client frames that contain stream-level markup. |
| `relay/framing/splitter.rs` | Cuts the TCP bytes into top-level elements, tolerant of elements split across reads. A hand-written state machine (tags with a name stack, quotes, comments, CDATA, PI), not a full parser: the bytes are forwarded untouched. Its contract, checked by property tests (`splitter/property_tests.rs`, 2026-10-16): what comes out never depends on where the reads were cut, including the 8 MiB limit (counted per element, not per read) and the position of an error (after the elements completed before it). |
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
- The Content Security Policy is described in its own section below.
- The webview reaches Rust through the repositories in `apps/desktop/app/repositories/` and the
  small modules in `apps/desktop/app/`, started once by `app/desktop.ts` when the page runs inside
  Tauri (`isTauri()`); in a plain browser (`pnpm app:dev`) none of this runs.
- **A browser on `http://localhost:1420` renders the interface but cannot sign in**: there is no
  relay and no keychain there. `TauriTransport` answers `ServerUnreachable` and `TauriKeychain`
  `KeychainUnavailable` at once (observed on 2026-10-15: before that guard, the failed `invoke`
  read as `Unknown`, "Something went wrong on my round"). Use the Tauri window (`pnpm desktop:dev`).

### Content Security Policy (`src-tauri/tauri.conf.json`, `app.security.csp`)

_Reviewed on 2026-10-16 against the code of `apps/desktop`, `packages/ui` and `packages/core`._
Tauri applies the policy to every page it serves and adds its own nonces to `script-src` and
`style-src` for what it injects (`tauri` 2.12.4, `src/manager/mod.rs`, `replace_csp_nonce`), so
the list below is the whole policy. Each source and why it is there:

| Directive | Source | Why |
|---|---|---|
| `default-src` | `'self'` | The fallback for every directive not listed: only the bundle. |
| `script-src` | `'self'` `'wasm-unsafe-eval'` | The Vite bundle, `/theme.js` and the lazy libomemo chunk; the WebAssembly flag for `/curve25519_compiled.wasm` (OMEMO). No `'unsafe-inline'`, no `'unsafe-eval'`: nothing in the code needs them (checked: no `eval`, no `new Function`, no inline script in `index.html`). |
| `worker-src` | `'self'` | No worker today; kept so that one from the bundle would work and one from a `blob:` would not. |
| `style-src` | `'self'` `'unsafe-inline'` | The bundled stylesheets. See the proposals for `'unsafe-inline'`. |
| `img-src` | `'self'` `data:` `blob:` | `data:` for the registration captcha image and the avatars (`accounts.ts`, `IMAGE_DATA_URL`); `blob:` for attachments shown from a fetched `Blob` (`useAttachment.ts`). Remote images are never loaded directly: `files.fetch` downloads them, so no `https:` here. |
| `font-src` | `'self'` | Fraunces and Figtree are bundled (`packages/ui/src/theme/fonts.css`). |
| `connect-src` | `'self'` `ipc:` `http://ipc.localhost` `ws://127.0.0.1:*` `https:` | `ipc:` (macOS, Linux) and `http://ipc.localhost` (Windows) are Tauri's command channel; `ws://127.0.0.1:*` is the relay, whose port changes at every launch (the token in the path is the real guard, see above); `https:` is HTTP upload and download (XEP-0363) to whatever host the server names. In development `'self'` also covers Vite's HMR socket on `localhost:1420` (CSP level 3: `'self'` matches `ws:` on the same host). No `wss://`: the desktop app always goes through the relay. |
| `object-src` | `'none'` | No plugin content, ever. Added 2026-10-16. |
| `frame-src` | `'none'` | No iframe in the interface (checked). Added 2026-10-16. |
| `base-uri` | `'none'` | No `<base>` tag; refusing one closes a classic way of redirecting relative script URLs. Added 2026-10-16. |

Tightened on 2026-10-16: `object-src`, `frame-src` and `base-uri` were added; they forbid things
the interface does not do, so nothing changes for the user. Not verified by launching the app on
that day: the checks were made against the code.

**Proposals, not applied** (each needs a run of the app on the three platforms to confirm):

- `style-src 'self'` without `'unsafe-inline'`: React sets inline styles through the CSSOM
  (`PendingParcel.tsx`, `Popover.tsx`), which CSP does not block, so the flag may only be there
  for Tauri's own injected styles. Tauri adds hashes for those when `'unsafe-inline'` is absent;
  to be confirmed on WebKit (macOS, Linux) and WebView2.
- `connect-src https:` narrowed to the upload host: not possible statically, the host is what
  the user's server announces (XEP-0363 `get`/`put` URLs). An alternative is to download through
  Rust (`reqwest` is already in the tree for the updater) and keep the webview offline except
  for the relay; a bigger change, for a later version.
- `form-action 'none'`: every form in the interface prevents its default submit; the directive
  would turn a forgotten `preventDefault` into a blocked navigation instead of a reload. Harmless
  in theory, unverified in practice.
- `media-src`: not set, so `default-src 'self'` applies; audio or video attachments played from a
  `blob:` URL would need `media-src 'self' blob:` the day the interface plays them.

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

### End-to-end scenario (`scripts/smoke-scenario.mjs`, driven `--smoke`)

`pnpm desktop:smoke:scenario` goes further than the sign-in: it proves, in the real app, that
messages travel both ways, that rooms work and that the app comes back after the server drops.

```sh
pnpm desktop:smoke:scenario
# = tauri build --debug --no-bundle && NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" node scripts/smoke-scenario.mjs
```

- The steps, in order, each with a timeout and a name that the failure line repeats: `server`
  (Prosody of `tools/xmpp-server/` running or started, `users.sh` for alice and bob), `app`
  (the debug build with `--smoke`, `HEY_POSTIE_SMOKE_LOGIN` and `HEY_POSTIE_SMOKE_DRIVE=1`),
  `sign-in`, `bob` (the hand-written client of the contract tests,
  `packages/core/src/repositories/converse/test-support/bobClient.ts`, over `wss://localhost:5281`),
  `direct bob->alice` (the app reports `message-received`), `direct alice->bob` (the app sends
  through `core.chats`, bob sees the stanza), `room join` (alice through `core.rooms.join` in
  `rooms.localhost`, bob after her), `room bob->alice`, `room alice->bob`, `reconnect` (Prosody is
  stopped and started again; the app must report a state other than `online`, then `online`
  again within 60 s), the two direct exchanges again, `room leave` (so that no bookmark makes the
  next sign-in rejoin). Exit 0 when all passed, 1 with `FAILED at step "<name>"` otherwise.
- The driven mode is the third face of `--smoke` (`smoke.rs`): with `HEY_POSTIE_SMOKE_DRIVE=1`
  (and a login, debug builds only) the app stays up after `smoke-online`, forwards every stdin
  line to the webview as a `smoke-command` event, prints every `smoke-step` event as
  `smoke: step {json}` on stderr, and exits on `quit` or when stdin closes (the driver dying
  takes the app with it) or after 180 s. `app/smoke.ts` answers four commands (`open`, `send`,
  `join`, `leave`, each acknowledged by a `done` or `failed` step) and reports `account` (state)
  and `message-received` (chat id, message id, direction, nick) steps. Steps carry identifiers
  only, never a body: the driver's output is safe to paste in a report.
- A `--smoke` run must not steal the screen from whoever is working on the machine (observed on
  2026-10-16 while screenshots were taken next to the author): on macOS the app sets
  `ActivationPolicy::Accessory` in `setup` (no dock icon, no activation) and `window::show_main`
  skips `set_focus` when the `window::Smoke` state is on. Added 2026-10-16, not yet verified on
  screen. Capture the window with `screencapture -l <window id> -x`: it works on a window that is
  not in front.
- Cleanup: bob leaves the room and closes, the app gets `quit` (SIGKILL after 5 s), and Prosody is
  stopped only when this run started it.
- Shared server: the built Prosody is git-ignored, so it lives in one checkout. Another folder is
  used with `HEY_POSTIE_XMPP_SERVER_DIR=<checkout>/tools/xmpp-server`. When port 5222 is served by
  a Prosody whose pidfile is not in that folder, the run stops at `server` and says so: `start.sh`
  would start a second Prosody that fails to bind quietly, and the restart would stop the wrong
  one (observed on 2026-10-16: the app kept talking to the other server and never saw a drop).
- No new dependency: bob needs a `DOMParser`, which the driver borrows from `jsdom`, core's test
  dependency, resolved from `packages/core`. Node 24 runs `bobClient.ts` directly (type stripping).
- Observed on 2026-10-16 (debug build, Prosody 13.0.7 shared with the contract tests): the
  thirteen steps passed in 5.4 s after the build. Around the restart the app reported
  `connecting` (twice: the drop, then Converse's own retry) and `online` within a few seconds,
  then both direct exchanges went through again.

### Transport (`app/repositories/transport.ts`)

`TauriTransport.websocketUrlFor()` asks the Rust command `relay_url` once and caches the answer:
`ws://127.0.0.1:<port>/xmpp/<token>`. The relay reads the XMPP domain from the first
`<open to="…"/>` frame, so the URL does not depend on the domain. A failed call becomes `ServerUnreachable` and the
cache is cleared, so the next sign-in tries again.

### Notifications (`app/repositories/notifier.ts`, `app/notificationClicks.ts`)

- `TauriNotifier.show` checks `isPermissionGranted()`, asks `requestPermission()` once per run if
  needed, then `sendNotification({ title, body, sound, extra: { chatId } })`. A refused permission is
  silent: the message still shows in the window. On desktop the plugin always answers "granted"
  without prompting (`src/desktop.rs`, 2.7.0, `request_permission` and `permission_state`): the
  real switch is the OS setting (macOS: System Settings > Notifications).
- The sound must be named, or the notification is silent on every desktop (fixed 2026-10-16, it was
  missing). `notificationSound()` picks the system default from the user agent: macOS
  `NSUserNotificationDefaultSoundName` (the only name `mac-notification-sys` 0.6.15,
  `objc/notify.m`, maps to the user's chosen alert sound), Windows `Default`
  (`tauri-winrt-notification` 0.8.1 makes a toast without a sound `silent="true"`), Linux
  `message-new-instant` (freedesktop sound theme). Checked on 2026-10-16 in the crate sources.
- A click opens the chat: `onAction` of the plugin reports a click (`actionId: 'tap'`) with the
  notification's `extra` on desktop too (verified in the plugin's `src/desktop.rs`, 2.7.0: macOS
  and Windows wait on `notify-rust`'s response; Linux listens on D-Bus). `openChatOnNotificationClick`
  registers that listener at startup, because the plugin only reports clicks on notifications shown
  while a listener existed. On a click it brings the window to front (`app/window.ts`) and emits
  `chat.requested` with the chat id. Nothing about the message is logged.
- Known limits (plugin docs): on Windows a click is reported only while the toast is on screen,
  not from the Action Center.
- macOS identity (decision of 2026-10-16: dev notifications come from Hey Postie, because the
  author chats in `pnpm desktop:dev` every day). The plugin sends in the name of
  `com.apple.Terminal` whenever `tauri::is_dev()` (`src/desktop.rs`, 2.7.0, lines 520-524); there is
  no setting for it. `mac-notification-sys` 0.6.15 keeps only the first application name of the
  process (a `Once`, `src/lib.rs` `set_application`), so `src-tauri/src/notification_identity.rs`
  claims the identifier of `tauri.conf.json` (`com.snouzylabs.heypostie`) in `setup`, before any
  notification, and the plugin's own Terminal claim becomes a no-op. Clicks still go through the
  plugin's `onAction`. Verified in the crate sources on 2026-10-16.
- The claim only succeeds when Launch Services knows an app with that identifier
  (`objc/notify.m`, `LSCopyApplicationURLsForBundleIdentifier`). Without one, the claim fails, dev
  notifications keep coming from Terminal (the swizzle falls back to `com.apple.Terminal`,
  `objc/notify.h`), and the dev terminal prints how to fix it. **One-time step**: `pnpm
  desktop:build`, copy `Hey Postie.app` from `apps/desktop/src-tauri/target/release/bundle/macos/`
  to `/Applications`, open it once, and allow Hey Postie in System Settings > Notifications
  (banners and sound). `/Applications` rather than a worktree's `target/`, which disappears with
  the worktree.
- Side effect, as before with Terminal: the hook answers `NSBundle.mainBundle.bundleIdentifier`
  for the whole dev process. Tauri creates the configured windows before `setup` (`tauri` 2.12.4,
  `app.rs` `fn setup`), so the webview's data store is not affected.
- Points to check: macOS shows the banner under the dev process only if Notification Center
  accepts a process that is not the registered bundle. The claim was verified (a scratch program
  got `set_application` → `Ok` on 2026-10-16); a banner seen on screen under "Hey Postie" from a
  real `pnpm desktop:dev` run has not been confirmed yet.

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

`pnpm run licenses` writes `packages/ui/src/data/licenses.json`, the data of the "Licenses" dialog
(dialog not built yet). Sources and format: [dependencies.md](dependencies.md), "The licenses
file". Rerun it in the same commit as a dependency change.

### Version (`src-tauri/tauri.conf.json`, `vite.config.ts`, `scripts/version-set.mjs`)

`version` in `tauri.conf.json` is the only hand-edited version. `pnpm version:set <x.y.z>` copies it
to `Cargo.toml`, `Cargo.lock` and the three `package.json`; `vite.config.ts` imports the JSON and
defines `import.meta.env.VITE_APP_VERSION` (typed in `app/modules.d.ts`), which `app/main.tsx`
hands to `App` as `version` for Settings > About. Changing the number by hand in one file is the
mistake the script exists to prevent.

### Updater (`app/updater.ts`, `tauri-plugin-updater`, `tauri-plugin-process`)

`checkForUpdatesAtStartup()` runs last in `startDesktopIntegrations` and never blocks: at most one
check per hour across restarts (`lastCheckedAt` in the `updater.json` store; `isCheckDue` is unit
tested), `check()` against `plugins.updater.endpoints`, and on a newer version the Tauri event
`update-available` (`{ version, currentVersion }`) plus a console line with the event name. No
download, no install, no interface yet. The capabilities `updater:default` and
`process:allow-restart` are granted for the day the interface calls `downloadAndInstall()` and
`relaunch()`. The signing key, the `latest.json` format and the release steps are in
[release.md](../product/release.md).

### Bundles (`src-tauri/tauri.conf.json`, `bundle`)

macOS `app` + `dmg`, Windows `nsis` + `msi`, Linux `appimage` + `deb`, plus the updater artifacts
(`createUpdaterArtifacts: true`, so a build needs the signing key). Publisher, category,
descriptions, copyright and `licenseFile` feed the installers' metadata. macOS: hardened runtime,
`Entitlements.plist`, macOS 12 minimum, `signingIdentity` null until a certificate exists (set by
environment, see release.md). Windows: WebView2 bootstrapper download, `certificateThumbprint`
null. Linux `.deb`: depends on `libwebkit2gtk-4.1-0`. Built and opened on macOS on 2026-10-16
(unsigned); Windows and Linux not run.

### Still open on the desktop side

- `tauri-plugin-autostart` (launch at login).
- `chat.requested` is emitted by the shell; the interface listens to it (milestone 1, UI).
- The default-window-icon tray icon (template icon for macOS dark menu bars).
- Single instance and `xmpp:` links on Windows and Linux: written from the crates' docs, not run.
- The update screen (download, install, relaunch) and the release server behind `latest.json`.
