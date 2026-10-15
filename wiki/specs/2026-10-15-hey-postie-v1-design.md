# Hey Postie, version 1: design

_Written on 2026-10-15 from the first brainstorming session. Decisions and their reasons are in
[product/decisions.md](../product/decisions.md); the brand in [product/brand.md](../product/brand.md).
Everything below was approved in conversation on 2026-10-15; the author then delegated the rest of
the design to the agent._

## 1. Goal

A modern replacement for Pidgin: an XMPP-only desktop chat client with a strong brand, free, open
source, on the app stores. Version 1 is done when the author uses it every day instead of Pidgin:
sign in, chat one-to-one and in rooms, with end-to-end encryption, files, reactions, system
notifications, and the history of the server.

Out of version 1: audio and video calls, web client, iOS, bots and automations, OpenPGP.

## 2. Architecture

```
hey-postie/                        pnpm workspace, like holy-pdf
├─ packages/core/                  the engine, TypeScript, no React
│  └─ src/
│     ├─ contracts/                types, service and repository interfaces
│     ├─ services/                 business rules (accounts, chats, rooms, messages, files, crypto, notifications)
│     ├─ repositories/             implementations: converse/, keychain/, transport/, storage/
│     ├─ fakes/                    in-memory repositories for tests and for the UI in dev
│     └─ container.ts              the one place where services and repositories are wired
├─ packages/ui/                    React components, screens, design system, illustrations, i18n
├─ apps/desktop/                   Tauri 2: Vite entry (ui + core) and src-tauri/ (Rust)
├─ apps/web/                       after version 1
├─ wiki/                           documentation, Obsidian vault
└─ tasks/                          agents' plans and lessons, untracked
```

### 2.1 Three layers

| Layer | Package | Rule |
|---|---|---|
| Presentation | `packages/ui`, `apps/*` | Talks to services only. Never imports `@converse/headless`, Tauri or storage. |
| Service | `packages/core/src/services` | Business rules, validation, sanitizing, domain errors, logging. Depends on repository interfaces. |
| Persistence | `packages/core/src/repositories` | Converse, IndexedDB, keychain, transport. Knows how, never why. |

Wiring happens in `container.ts`: `createCore({ transport, keychain, notifier })` returns the
services. The desktop app passes Tauri-backed repositories; tests and the dev UI pass fakes.

### 2.2 The XMPP engine: `@converse/headless` 14

Checked on 2026-10-15 from the npm package (`converse-headless-14.0.0.tgz`):

- MPL-2.0; 20 headless plugins: chat, muc, mam, omemo (0.3 and OMEMO 2, `plugins/omemo/sce.js`),
  reactions (`urn:xmpp:reactions:0`), roster, smacks (XEP-0198), bookmarks, disco, caps, vcard,
  pubsub, blocklist, adhoc, ping, status, emoji.
- State lives in Backbone-like Models and Collections (`@converse/skeletor`); the public entry is
  `converse.initialize(settings)` and `api.*`; events through `api.listen.on(...)`.
- Runtime files that must sit next to the bundle: `libomemo.esm.min.js` (GPL-3.0, loaded on
  demand), `curve25519_compiled.wasm`, `emoji.json`.
- **Not in headless**: in-band registration (XEP-0077) and account deletion. We implement both
  ourselves in `repositories/converse/registration.ts`, with plain IQ stanzas through Strophe
  (`_converse.api.sendIQ`).
- Connection: Strophe speaks WebSocket (RFC 7395) or BOSH only. Hence the relay below.

Converse is wrapped once, in `repositories/converse/`. Its models never leave that folder: every
repository method returns the plain types of `contracts/`.

### 2.3 The Rust layer (`apps/desktop/src-tauri`)

| Module | Role |
|---|---|
| `relay` | A local WebSocket ↔ TCP relay. Listens on `127.0.0.1:<random port>`, path `/xmpp/<random token>` generated at launch and handed to the webview through a Tauri command. For each WebSocket connection it reads the domain from the `<open/>` frame, resolves `_xmpps-client._tcp` (direct TLS, XEP-0368) then `_xmpp-client._tcp` (STARTTLS) through `hickory-resolver`, connects, upgrades to TLS with `rustls` (system roots, certificate checked against the domain), and translates between RFC 7395 framing (`<open/>`, `<close/>`, one stanza per frame) and RFC 6120 streams (`<stream:stream>`, streaming XML through `quick-xml`). Inspired by `xmpp-proxy` (AGPL-3.0, Rust), kept as a reference, not a dependency. |
| `keychain` | Passwords through the `keyring` crate: macOS Keychain, Windows Credential Manager, Linux Secret Service. Commands `keychain_set`, `keychain_get`, `keychain_delete`, keyed by JID. |
| `notifications` | `tauri-plugin-notification`; a click brings the window to front and tells the webview which chat to open. |
| `tray` | Menu bar / tray icon with unread count, "Open", "Quit". `tauri-plugin-autostart` for launch at login (off by default). |
| `links` | Registers the `xmpp:` URI scheme (`tauri-plugin-deep-link`) and opens the chat or room. |

The webview reaches Rust only through typed Tauri commands, called from the repositories in
`packages/core/src/repositories/tauri/`. The web app will provide the same repository interfaces
over a direct WebSocket.

Tauri 2 stable is used (`tauri = "2"`, `@tauri-apps/cli` 2.x). Tauri 3 was alpha on 2026-10-15.

### 2.4 Storage

- Messages, rosters, bookmarks and OMEMO state: Converse's own IndexedDB stores, in the webview's
  profile, private to the app (`persistent_store: 'IndexedDB'`).
- Passwords: OS keychain only.
- Preferences (theme, notification rules, window state): `tauri-plugin-store`, a JSON file in the
  app's data folder.
- The App Store sandbox is enabled from the first build (`com.apple.security.app-sandbox`, network
  client, user-selected files read/write for sending and saving attachments).

### 2.5 Prepared, not built

- Web: same `ui` and `core`; transport repository = direct WebSocket; notifier = Web Notifications.
- iOS push: `notifications` service gets an `enablePush(relay)` method (XEP-0357) when the relay
  exists; a Notification Service Extension in Swift decrypts OMEMO pushes.

## 3. Data and flows

### 3.1 Types (in `contracts/`)

```ts
Account    { jid, displayName, state: 'offline' | 'connecting' | 'online' | 'error', error?: DomainError }
Contact    { jid, name, avatarUrl?, presence: 'online' | 'away' | 'dnd' | 'offline', subscription: 'both' | 'to' | 'from' | 'none' }
Room       { jid, name, nick, joined: boolean, unreadCount, mentionsCount }
Chat       { id, kind: 'direct' | 'room', peerJid, title, lastMessage?, unreadCount, encrypted: boolean }
Message    { id, chatId, fromJid, fromNick?, body, sentAt, direction: 'in' | 'out',
             status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed',
             encryption: 'none' | 'omemo' | 'undecryptable', attachments: Attachment[], reactions: Reaction[],
             isMention: boolean }
Attachment { url, name, size, mimeType, thumbnailUrl?, encryption: 'none' | 'aesgcm', progress?: number }
Reaction   { emoji, fromJids: string[] }
Device     { jid, deviceId, fingerprint, trust: 'untrusted' | 'trusted' | 'verified' | 'blocked', isOwn: boolean }
```

Services expose `get*`/`list*` queries, commands, and a typed event emitter
(`core.events.on('message.received', handler)`). The UI subscribes through hooks in `packages/ui`.

### 3.2 Sign in

1. UI calls `accounts.signIn({ jid, password, remember })`.
2. Service validates the JID (RFC 7622 shape), stores the password in the keychain if `remember`,
   asks the transport repository for a WebSocket URL for the domain (the Rust relay URL with the
   domain as query), and tells the Converse repository to connect.
3. Converse negotiates SASL (SCRAM-SHA-1/256, PLAIN only over TLS), stream management (XEP-0198),
   client state indication (XEP-0352), carbons (XEP-0280).
4. On `connected`: roster loads, bookmarked rooms are joined, MAM catches up from the last known
   message of each chat. The account state becomes `online`.
5. Errors become domain errors: `InvalidCredentials`, `ServerUnreachable`, `CertificateInvalid`,
   `RegistrationUnsupported`, `AccountConflict`.

### 3.3 Account creation and deletion (XEP-0077)

- `accounts.register({ domain, username, password })`: open a stream to the domain, send
  `<iq type='get'><query xmlns='jabber:iq:register'/></iq>`, fill `username` and `password`
  (if the server answers with a data form or a CAPTCHA, show the form; unsupported challenge types
  show `RegistrationUnsupported` and a link to the server's website), then sign in.
- A short list of suggested public servers that accept in-band registration is in the UI; the user
  can type any domain.
- `accounts.deleteAccount()`: `<iq type='set'><query xmlns='jabber:iq:register'><remove/></query></iq>`,
  then wipe local data for that JID (IndexedDB stores, keychain entry, preferences). Confirmation
  screen with the JID typed back. Required by App Store rule 5.1.1(v).

### 3.4 A message arrives

1. Converse parses (and decrypts, if OMEMO) and emits a message event.
2. The repository maps it to `Message`; the service sanitizes the body (plain text; URLs detected
   for linking; no HTML), stores nothing itself (Converse persists), and emits `message.received`.
3. `notifications` decides: notify when the window is not focused or the chat is not open; in rooms,
   only on mention or on a direct message, by default (per-room setting). Title: contact or room
   name; body: text, or "Sent you a file" for an attachment, or "Encrypted message" when the body
   must not be shown (option). A click opens the chat.
4. `undecryptable` messages show a Postie sentence ("This letter was sealed for another device"),
   never an empty bubble.
5. Delivery receipts (XEP-0184) and chat markers (XEP-0333) update `status`.

### 3.5 Sending a file (XEP-0363)

1. UI calls `files.send(chatId, file)`.
2. Service checks the size against the server's `max-file-size` (from disco), rejects with
   `FileTooLarge`; if the chat is encrypted, encrypts with AES-256-GCM (random key and IV, appended
   to the URL fragment, `aesgcm://` scheme); requests a slot; uploads with progress; sends the
   message with the URL as body and `oob` element.
3. Images get a client-side thumbnail; incoming images are downloaded (and decrypted) on demand,
   displayed inline under a size limit, otherwise as a file card with "Save".
4. Failures set `status: 'failed'` with a retry.

### 3.6 OMEMO trust

- Blind trust before verification (like Conversations): a new device of a contact is used and
  shown `untrusted`; the user can mark it `verified` after comparing fingerprints (text and QR), or
  `blocked`. Once a contact has one verified device, new devices are no longer trusted blindly.
- Own devices are listed with fingerprints; the user can remove one.
- Encryption is on by default in direct chats when the contact has OMEMO devices; in rooms when the
  room is members-only and non-anonymous and every member has devices (same rule as Conversations).
- A chat without any device shows "Postie cannot seal this letter: no key on the other side".

### 3.7 Offline and reconnection

- Messages written offline stay `pending` and are sent on reconnection (Converse's queue).
- Reconnection with exponential backoff (1 s to 60 s); stream resumption first, then a full
  reconnect with MAM catch-up.
- The sidebar shows the account state; a yellow banner says "Postie is on his bike" while
  reconnecting.

### 3.8 Errors

Repositories throw technical errors; services translate them into `DomainError` subclasses with
a code and context. The UI maps codes to Postie's sentences in the i18n dictionaries. No raw
technical message reaches the screen; details go to the log (without content or secrets).

## 4. Interface and brand

### 4.1 Screens of version 1

| Screen | Content |
|---|---|
| Welcome | Postie waves; "Sign in" or "Create an account". |
| Sign in | JID, password, "remember me", advanced (custom host and port, later). |
| Create account | Domain (suggestions + free input), username, password twice, server form or CAPTCHA when the server asks. |
| Main window | Three columns: sidebar (account, search, chat list with unread badges, "+" for new chat or room), conversation, optional details pane (contact or room info, members, devices, shared files). |
| Conversation | Messages grouped by sender and day, bubbles with status, reactions row, attachment cards, composer with emoji picker, attach button, drag-and-drop, typing indicator (XEP-0085). Room: mentions highlighted, member list, topic. |
| Join a room | Address or browse the account's server rooms (disco items); nick. |
| Add a contact | JID, optional message; incoming requests appear at the top of the sidebar. |
| Settings | Account (name, avatar, status), Encryption (own and contacts' devices, fingerprints), Notifications (rules, sounds, per-room), Appearance (theme follows system, light, dark), Delete account, About and licenses. |

Window minimum 900 × 600. Keyboard: Cmd/Ctrl+K quick switcher, Cmd/Ctrl+N new chat, Esc closes panes,
arrows in the chat list. Every control reachable by keyboard; AA contrast; reduced motion honored.

### 4.2 Design system "Postal"

Tokens in `packages/ui/src/theme/tokens.css`, light and dark, theme follows the system by default.

- **Palette, light**: paper `#F7F2E8` (cream envelope), ink `#1E2230`, primary "uniform navy"
  `#1F3A68`, accent "mailbox red" `#C8321B`, kraft `#B98A4E`, highlighter "stamp yellow" `#F2C14E`,
  success `#2E7D4F`, warning `#A35900`. Dark: paper `#171A22`, ink `#EEE9DD`, navy lightened to
  `#8FB0E8`, red to `#F07A66`, kraft to `#D9B27C`.
- **Typography**: Fraunces 700 (soft retro serif) for headings and Postie's sentences; Figtree for
  text; monospace for fingerprints. Bundled, not loaded from the network.
- **Shapes**: bubbles with a slight paper texture, incoming bubbles cream, outgoing bubbles navy;
  encrypted chats show a small wax-seal badge; attachments are parcel cards with kraft background;
  stamps for statuses ("Delivered", "Read").
- **Icons**: Lucide.

### 4.3 Postie

A retro postman: cap, satchel, bike. Five moods, as SVG components in `packages/ui/src/illustrations/`:
`happy` (welcome), `delivering` (sending, loading), `sealed` (encryption on, wax seal in hand),
`oops` (errors, never mocking), `asleep` (empty states, offline). Version 1 ships simple line-art
placeholders drawn as SVG; an illustrator later, with these as the brief.

Feature names, for texts and empty states: Postie Seal (encryption), Postie Parcel (files),
Postie Hall (rooms), Postie Bell (notifications), Postie Ledger (history).

Tone of voice: first person, short sentences, nods to postal life ("Sealed and stamped", "Your
letter is on the bike", "Nobody at this address"), never a joke in an error. French and English
from the start; dictionaries in `packages/ui/src/i18n/{fr,en}.ts`; the language follows the system.

## 5. Tests and verification

| Level | Tool | What |
|---|---|---|
| Unit, core | Vitest | Every service against fake repositories: validation, sanitizing, domain errors, notification rules, OMEMO trust rules, file size checks. |
| Unit, ui | Vitest + Testing Library | Components with a fake core: sign-in form errors, chat list ordering and badges, message grouping, composer, reactions. |
| Contract, repositories | Vitest, opt-in (`XMPP_TEST_SERVER`) | Converse repositories against a local Prosody (Docker compose in `tools/xmpp-server/`): connect, roster, send and receive, MAM, MUC, upload, register and delete. Run in CI on a nightly job, locally on demand. |
| Rust | `cargo test` | Relay framing translation (WS ↔ stream), SRV fallback order, keychain commands with an in-memory backend. |
| Smoke, desktop | `pnpm desktop:smoke` | Debug build with `--smoke`: the relay starts, the webview loads, the core initializes, the process exits 0. Same approach as Holy PDF. |
| End to end | Playwright, later | On the web build, against the Docker Prosody. |

`pnpm verify` runs: types, Biome (lint and format), unit tests, `cargo fmt --check`, `cargo clippy`,
`cargo test`, the Vite build. CI (GitHub Actions) runs it on every pull request on Ubuntu and
macOS. Nothing is "done" without it.

## 6. Licensing and distribution

- AGPL-3.0-or-later with the two Holy PDF additional terms (app-store distribution permission; no
  trademark rights), copyright Snouzylabs S.R.L. and the contributors. DCO on contributions.
- Dependencies recorded with their licenses in `wiki/development/dependencies.md`. Known point:
  `libomemo.js` (GPL-3.0) and libsignal-derived code on the App Store; see decisions.md.
- Builds: macOS (signed and notarized, then App Store), Windows (MSIX for the Store, plus an
  installer), Linux (AppImage and Flatpak). Updates through `tauri-plugin-updater` for the direct
  builds. Version 1 ships the direct builds; store listings follow.

## 7. Milestones

| # | Name | Done when |
|---|---|---|
| 0 | Skeleton | Workspace, contracts, fakes, `pnpm verify` green in CI, Tauri window opens with the design tokens and Postie "happy". |
| 1 | Letters | Sign in, roster, 1:1 chat with MAM history, delivery status, notifications, reconnection, tray. The author chats with Pidgin's contacts. |
| 2 | Hall | Rooms: join, bookmarks, members, mentions, per-room notification rules. |
| 3 | Seal | OMEMO: on by default, trust screen, fingerprints, undecryptable states, own devices. |
| 4 | Parcel | Files and images with encryption, emoji picker, reactions. |
| 5 | Counter | Account creation and deletion, settings, about and licenses, sandbox, signing, smoke, store readiness. |

Each milestone is one spec section above, one plan in `tasks/`, several small pull requests.

## Points to check

- The exact Converse API for OMEMO 2 activation and for reactions (read `types/` when implementing).
- Prosody modules needed for the contract tests (`mod_http_file_share`, `mod_mam`, `mod_muc`,
  `mod_register`, `mod_smacks`, `mod_csi_simple`).
- Whether `keyring` on Linux needs a running Secret Service in CI (fall back to an in-memory backend
  there).
