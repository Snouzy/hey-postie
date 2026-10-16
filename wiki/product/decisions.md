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

## Interface

- Decision of 2026-10-16: the desktop app of [block/buzz](https://github.com/block/buzz)
  (Apache-2.0) is the first reference for the interface: layout, interactions, keyboard. Not a code
  base (Nostr, its own relay, no OMEMO, far too large). The brand stays ours.
- Styling moves to Tailwind 4 with shadcn conventions, in one migration during a UI freeze, at
  visual parity. Messages get two layouts (bubbles, lines) behind a setting. The text of a sealed
  letter stays out of notifications unless the user turns it on.
  Design: [specs/2026-10-16-buzz-ui-tailwind-design.md](../specs/2026-10-16-buzz-ui-tailwind-design.md).
- Decision of 2026-10-17: [processone/fluux-messenger](https://github.com/processone/fluux-messenger)
  (AGPL-3.0, TypeScript, by ProcessOne, the makers of ejabberd) is the second reference, beside
  Buzz. It is a competitor on our own ground (a modern desktop XMPP client), so it shows how the
  XMPP features we need behave in a modern interface: moderation, polls, whispers, link previews,
  unread badges, read sync, search. We take ideas, flows and protocol behaviour, **not its code**:
  our App Store permission (LICENSE-EXCEPTION.md) only covers code whose copyright we hold, so
  AGPL code copied from Fluux would block store distribution unless ProcessOne agrees in writing.

## Process

- Decision of 2026-10-15: no CI for now. `pnpm verify` runs locally before every commit; CI comes
  when a second contributor or a release needs it. Speed of iteration first.

## Milestone 1 (2026-10-15)

- Built in five parallel lanes, one git worktree each: Rust relay, Converse repositories, UI,
  desktop wiring, local Prosody. Each code lane got an independent review before the merge.
- Reconnection uses Converse's loop; MAM catch-up does not notify (see the spec, 3.7).
- Local test server: Prosody built from source into `tools/xmpp-server/` (Homebrew has no formula).

## Night of 2026-10-16 (author's decisions before sleeping)

- Messages from people outside the roster: a contact request comes first, like Signal. Their
  messages are held behind a "message request" screen (accept / block / ignore); nothing of theirs
  is auto-loaded or notified until accepted.
- Settings become a Gajim-like window with sections (General, Account, Appearance, Notifications,
  Privacy and encryption, Advanced) instead of one dialog.
- Presence status (available / away / do not disturb + a sentence), avatars, typing indicator:
  in. Empty states and first-launch screens with Postie: in.
- Leaving a room must be reachable from the room row as well as from its details pane.
- Encryption on by default when the contact has a key (spec 3.6, unchanged).
- Big item for the night: the marketing site skeleton (hey-postie.com), after the product items.
- Postie tutoie in French (« tu peux tutoyer, fais-en une règle »): a friend, not a clerk. The
  rule lives in [brand.md](brand.md), "Voice".

## Points to check

- Licenses: OMEMO relies on libsignal (GPL-3.0). Combined with app-store distribution, this is a
  known grey zone (many (A)GPL apps ship on the App Store). Not a lawyer's opinion.
- Which OMEMO version each major client speaks today (Conversations, Gajim, Monal, Dino).
