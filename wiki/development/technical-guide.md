# Technical guide

_Created 2026-10-15. Updated as the code grows; each section names the files it describes._

## The tree

```
packages/core/     the engine, TypeScript, no React
  src/contracts/   types, errors, events, repository and service interfaces
  src/services/    business rules; depend on repository interfaces only
  src/repositories/ implementations: converse/ (XMPP, roster, chats), tauri/ (keychain, transport, notifier)
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
  system notification is shown (window not focused, or another chat open).
- **Persistence**: `apps/desktop/app/repositories/keychain.ts` calls the Rust `keychain_*` commands;
  `packages/core/src/fakes/keychain.ts` keeps a `Map` in memory for tests.
  `packages/core/src/repositories/converse/` wraps `@converse/headless`: `engine.ts` owns the one
  Converse instance, `xmpp.ts`, `roster.ts` and `chat.ts` implement the three repository contracts,
  `mappers.ts` turns Converse models into the plain types of `contracts/`. `createConverseRepositories()`
  (exported by `@hey-postie/core`) wires them over one engine; `apps/desktop/app/dependencies.ts`
  calls it. Details and pitfalls: [converse.md](converse.md).

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
- The XMPP relay (WebSocket ↔ TCP) arrives with milestone 1; see the
  [version 1 design](../specs/2026-10-15-hey-postie-v1-design.md), section 2.3.
