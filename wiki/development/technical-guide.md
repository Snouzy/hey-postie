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

_Checked on 2026-10-15 against Tauri 2.12.4, `tauri-plugin-notification` 2.7.0,
`tauri-plugin-deep-link` 2.6.2, on macOS. Windows and Linux are assumed from the crates' docs._

- The Rust side lives in `apps/desktop/src-tauri/src/`: `lib.rs` registers plugins, commands and
  window events; `keychain.rs` wraps the `keyring` crate (macOS Keychain, Windows Credential
  Manager, Linux Secret Service; `KeychainUnavailable` when none works); `tray.rs`, `links.rs`,
  `window.rs` are described below; `smoke.rs` implements `--smoke`.
- macOS entitlements (`src-tauri/Entitlements.plist`): app sandbox, network client, user-selected
  files. They are on from the first build so that the App Store build is the same build.
- The webview reaches Rust through the repositories in `apps/desktop/app/repositories/` and the
  small modules in `apps/desktop/app/`, started once by `app/desktop.ts` when the page runs inside
  Tauri (`isTauri()`); in a plain browser (`pnpm app:dev`) none of this runs.

### Transport (`app/repositories/transport.ts`)

`TauriTransport.websocketUrlFor()` asks the Rust command `relay_url` once and caches the answer:
`ws://127.0.0.1:<port>/xmpp/<token>`. The relay reads the XMPP domain from the first
`<open to="…"/>` frame, so the URL does not depend on the domain. A failed call (including "command
not found" until the relay branch `feat/m1-relay` is merged) becomes `ServerUnreachable` and the
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
  "Open Hey Postie" (show, unminimize, focus) and "Quit" (`app.exit(0)`). The menu texts are
  English only for now: the tray lives in Rust, outside the i18n dictionaries.
- The command `set_unread_count(count)` sets the tooltip ("Hey Postie: 3 unread"), the text next to
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
- Open: on Windows and Linux the OS starts a second instance with the link as argument; the
  `single-instance` plugin (with its `deep-link` feature) is needed to forward it to the running
  app. Not added yet (one dependency at a time).

### Still open on the desktop side

- The relay and its `relay_url` command (branch `feat/m1-relay`).
- `tauri-plugin-autostart` (launch at login) and the `single-instance` plugin.
- `chat.requested` is emitted by the shell; the interface listens to it (milestone 1, UI).
- The default-window-icon tray icon (template icon for macOS dark menu bars).
