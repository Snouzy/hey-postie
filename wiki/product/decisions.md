# Decisions

_Decisions of 2026-10-15, first brainstorming session. The full design will be in `specs/`._

## Product

- An **XMPP-only** chat client, public, free and open source, distributed on the app stores.
  A paid option may come later (iOS push relay, hosted XMPP server).
- Use cases: one-to-one chats, group chats (MUC), and a client of our own (integrations, bots later).

## Scope of version 1

Sign in, account creation (XEP-0077) **and account deletion** (required by App Store rule 5.1.1(v)),
one-to-one chats, group chats (XEP-0045), end-to-end encryption OMEMO (XEP-0384), system
notifications, server history (XEP-0313), files and images (XEP-0363), emoji reactions (XEP-0444).

## Platforms

- Desktop first: macOS, Windows, Linux.
- Web after version 1, as a secondary client. Limits to state to users: WebSocket only, notifications
  only while the tab is open, browser storage can be cleared (and with it the OMEMO identity), and
  the code is served by the site on each visit (same reason Signal has no web app).
- iOS later, with push notifications (XEP-0357) through a relay server.
- The app is built for the App Store sandbox from day one.

## Stack

**Tauri 2 + `@converse/headless` + React (TypeScript)**, with a Rust layer for the system.

Why, and what was rejected (checked on 2026-10-15):

| Option | Why not |
|---|---|
| Swift + Martin (Tigase) | Apple only; last code change in January 2025 |
| QXmpp (C++/Qt) | OMEMO 2 only: no proof that Conversations, Gajim or Monal speak OMEMO 2, so encryption could fail with many contacts |
| xmpp-rs (Rust) | no mature OMEMO crate; we would write the cryptography ourselves |
| Preact | its size advantage does not matter in a desktop app; React has the larger ecosystem (virtual lists, emoji pickers, accessible components) |

Converse.js (MPL-2.0) is the most complete cross-platform XMPP engine: MUC, MAM, HTTP upload,
registration, OMEMO 0.3 and OMEMO 2 since version 14.0.0 (June 2026).
Sources: [Converse.js v14.0.0](https://newreleases.io/project/github/conversejs/converse.js/release/v14.0.0),
[XMPP Newsletter June 2026](https://xmpp.org/2026/07/the-xmpp-newsletter-june-2026/).

When the protocol behavior is unclear, look at how [Gajim](https://github.com/gajim/gajim) does it.

## Process

- Decision of 2026-10-15: no CI for now. `pnpm verify` runs locally before every commit; CI comes
  when a second contributor or a release needs it. Speed of iteration first.

## Milestone 1 (2026-10-15)

- Built in five parallel lanes, one git worktree each: Rust relay, Converse repositories, UI,
  desktop wiring, local Prosody. Each code lane got an independent review before the merge.
- Reconnection uses Converse's loop; MAM catch-up does not notify (see the spec, 3.7).
- Local test server: Prosody built from source into `tools/xmpp-server/` (Homebrew has no formula).

## Points to check

- Licenses: OMEMO relies on libsignal (GPL-3.0). Combined with app-store distribution, this is a
  known grey zone (many (A)GPL apps ship on the App Store). Not a lawyer's opinion.
- Which OMEMO version each major client speaks today (Conversations, Gajim, Monal, Dino).
