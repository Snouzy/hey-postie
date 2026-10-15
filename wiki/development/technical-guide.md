# Technical guide

_Created 2026-10-15. Updated as the code grows; each section names the files it describes._

## The tree

```
packages/core/     the engine, TypeScript, no React
  src/contracts/   types, errors, events, repository and service interfaces
  src/services/    business rules; depend on repository interfaces only
  src/repositories/ implementations: converse/ (XMPP), tauri/ (keychain, transport, notifier)
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
  failures into `DomainError`s.
- **Persistence**: `apps/desktop/app/repositories/keychain.ts` calls the Rust `keychain_*` commands;
  `packages/core/src/fakes/keychain.ts` keeps a `Map` in memory for tests.

## Run and verify

| Command | What |
|---|---|
| `pnpm desktop:dev` | Opens the app with Vite hot reload. |
| `pnpm desktop:smoke` | Debug build, starts the app with `--smoke`, exits 0 when the webview has rendered. |
| `pnpm check` | TypeScript, every package. |
| `pnpm lint` | Biome (lint and format). `pnpm lint:fix` writes the fixes. |
| `pnpm test` | Vitest, every package. |
| `pnpm rust` | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` in `apps/desktop/src-tauri`. |
| `pnpm verify` | All of the above, then the Vite build. Must be green before a pull request. |

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

- The Rust side lives in `apps/desktop/src-tauri/src/`: `lib.rs` registers plugins and commands;
  `keychain.rs` wraps the `keyring` crate (macOS Keychain, Windows Credential Manager, Linux Secret
  Service; `KeychainUnavailable` when none works); `smoke.rs` implements `--smoke`.
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
| `relay/server.rs` | Accepts WebSockets; a path other than `/xmpp/<token>` is answered `404` and dropped. |
| `relay/bridge.rs` | One session: waits for the client's `<open/>`, resolves and connects, then pumps frames both ways until one side closes. STARTTLS negotiation lives here too. |
| `relay/framing.rs` | WS ↔ stream translation: `<open/>` ↔ `<stream:stream>`, `<close/>` ↔ `</stream:stream>`, `stream:`-prefixed elements get `xmlns:stream` re-declared so each frame parses on its own. |
| `relay/framing/splitter.rs` | Cuts the TCP bytes into top-level elements, tolerant of elements split across reads. A hand-written state machine (tags, quotes, comments, CDATA, PI), not a full parser: the bytes are forwarded untouched. |
| `relay/resolve.rs` | SRV lookup and RFC 2782 ordering (priority, then weighted random). |
| `relay/tls.rs` | `rustls` client with the OS root store; SNI and verification use the XMPP domain. |

**Handshake with the webview.** The `relay_url` command (`lib.rs`) returns
`ws://127.0.0.1:<port>/xmpp/<token>`. The token is the only guard: another local process cannot
guess it, and the server only listens on the loopback interface. The URL changes at every launch.

**Connection order** for a domain, each attempt with a 10 s timeout:

1. `_xmpps-client._tcp.<domain>` SRV records (direct TLS, XEP-0368), by priority then weight;
2. `_xmpp-client._tcp.<domain>` SRV records (STARTTLS), same order;
3. without any SRV record: `<domain>:5223` (direct TLS) then `<domain>:5222` (STARTTLS).

A refused certificate stops the search at once (moving on to a weaker candidate is what a
downgrade attack wants) and closes the WebSocket with reason `CertificateInvalid`. Other failures
try the next candidate; when none is left the reason is `ServerUnreachable`. A protocol problem
(bad XML, STARTTLS not offered, the first frame is not `<open/>`) is `StreamError`. The client
sees only that reason, never a payload.

**Framing.** Client → server: an `<open/>` frame becomes a `<stream:stream>` header (also after
SASL, when Strophe restarts the stream), `<close/>` becomes `</stream:stream>`, anything else is
written as is. Server → client: the header becomes `<open from id xml:lang/>`, each complete
top-level element becomes one text frame, `</stream:stream>` becomes `<close/>` then a normal
WebSocket close.

**Debugging.** `RELAY_DEBUG=1 pnpm desktop:dev` prints the relay's events to stderr: candidates
tried, bytes per direction, element kinds, close reasons. Never frame contents. The ignored
integration test opens a real stream through the relay:

```
XMPP_TEST_DOMAIN=example.org RELAY_DEBUG=1 cargo test relay -- --ignored --nocapture
```

It expects an `<open/>` frame then a `<stream:features>` frame. Verified on 2026-10-15 against
`jabber.org` (SRV, STARTTLS on 5222) and `conversations.im` (SRV, direct TLS on 443).
