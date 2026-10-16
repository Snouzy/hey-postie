# Hey Postie

**A modern XMPP desktop client for teams that want control without going back to Pidgin.**

Private conversations, shared rooms, OMEMO encryption and a local MCP bridge for Claude — on the
XMPP server you already trust.

https://github.com/user-attachments/assets/9db9c88e-9c1c-4163-825b-9db26ada2a22

> **Status: in active development. There is no public download or managed service yet.**

[Join an early pilot](mailto:hello@hey-postie.com?subject=Hey%20Postie%20early%20pilot) ·
[Explore the wiki](wiki/index.md) · [Contribute](CONTRIBUTING.md)

## Keep your server. Upgrade the experience.

Hey Postie is an open-source XMPP client for macOS, Windows and Linux (the Windows and Linux
builds are not tested yet). It works with existing XMPP
servers and with people using Conversations, Gajim, Monal, Dino and other federated clients.

The current code includes:

- one-to-one conversations and group rooms;
- OMEMO end-to-end encryption;
- files, images, reactions and server-backed history;
- search in a conversation, read state synchronized across your devices, desktop notifications;
- a local MCP server that lets Claude read, draft and act through explicit permission levels.

Claude access is off by default. Direct sending requires the highest permission level and an
explicit confirmation in Claude. Your Anthropic account and model usage remain separate from Hey
Postie.

## For teams

### Already running XMPP?

Keep Prosody, ejabberd, Openfire or your current provider. Hey Postie can become the desktop client
for your team without moving accounts or breaking federation.

We are looking for early organizations that need help with:

- compatibility validation against their XMPP setup;
- desktop packaging and managed deployment;
- migration from Pidgin or another legacy client;
- onboarding, updates and technical support.

This is the first commercial pilot: a deployment and support engagement around your existing
server. The client remains free software.

[Discuss a deployment pilot](mailto:hello@hey-postie.com?subject=Hey%20Postie%20deployment%20pilot)

### Need the server managed too?

A managed Hey Postie space is a separate service we are validating. It would cover the XMPP server,
local accounts, domain setup, backups, monitoring, updates, onboarding and support.

Billing would apply to **local accounts hosted and administered for your organization**, not to the
people they can contact. XMPP is federated: for example, `alice@your-company.com` can talk to
`client@another-server.org`; the external contact is not a billable Hey Postie account.

The managed offer is not available yet. We will build its automation only after teams validate the
need through paid pilots.

[Ask about the managed pilot](mailto:hello@hey-postie.com?subject=Hey%20Postie%20managed%20pilot)

## Why Hey Postie

- **Open network:** communicate across XMPP servers instead of locking every participant into one
  vendor.
- **Modern desktop experience:** give teams a focused client without replacing their infrastructure.
- **Privacy by design:** OMEMO, local storage, OS keychain and no advertising or analytics SDK.
- **Claude on your terms:** MCP runs locally, is disabled by default and exposes separate read,
  draft and send permissions.
- **Open source:** inspect, self-build and adapt the client under AGPL-3.0-or-later.

## How it compares

Checked on 2026-10-17 against each client's own XEP declaration (DOAP), its source and its latest
release; sources and caveats in [the report](wiki/reports/2026-10-17-xmpp-clients-compared.md).
"Yes" means in a released version, except for Hey Postie, which has no release yet.

|  | **Hey Postie** | Gajim | Dino | Pidgin 2 | Fluux | Converse.js | Monal |
|---|---|---|---|---|---|---|---|
| Mac · Windows · Linux | ✅ ✅¹ ✅¹ | how-to · ✅ · ✅ | Linux only | — · ✅ · ✅ | ✅ ✅ ✅ | in a browser | Mac only (+ iOS) |
| Encryption that Conversations, Monal… read (OMEMO) | ✅ 0.3 and OMEMO 2 | ✅ 0.3 | ✅ 0.3 | plugin (lurch, 2021) | ❌ OpenPGP only | ✅ 0.3 and OMEMO 2 | ✅ 0.3 |
| Edit · delete for everyone | ✅ · ✅ | ✅ · ✅ | ✅ · ❌ | ❌ · ❌ | ✅ · ✅ | ✅ · ✅ | ✅ · ✅ |
| Reactions · replies | ✅ · ✅ | partial · ✅ | ✅ · ✅ | ❌ · ❌ | ✅ · ✅ | ✅ · ✅ | ❌ · ❌ |
| "Read" for the sender · read state on all your devices | ✅ · ✅ | partial · ✅ | ✅ · ❌ | ❌ · ❌ | ❌ · ✅ | partial · ❌ | ✅ · ✅ |
| Room moderation | ✅² | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create · delete your account from the app | ✅ · ✅ | ✅ · ✅ | ✅ · ❌ | ✅ · ✅ | ❌ · ❌ | ✅ · ❌ | partial · ✅ |
| Link previews | rooms, from the server | ✅ | ❌ | ❌ | ✅ | rooms | ✅ |
| Search | in a conversation | ✅ | ✅ | log viewer | ✅ | ❌ | ✅ |
| AI assistant (Claude, over MCP) | ✅ 12 tools, sending only with your approval | ❌ | ❌ | ❌ | ✅ 3 tools | ❌ | ❌ |
| Latest release | none yet | 2.6.0 (Aug 2026) | 0.5.1 (Nov 2025) | 2.14.14 (Jan 2025) | 0.17.4 (Sep 2026) | 14.0.0 (Jun 2026) | 6.4.23 (Oct 2026) |
| License | AGPL-3.0 | GPL-3.0 | GPL-3.0 | GPL-2.0 | AGPL-3.0 | MPL-2.0 | BSD-2 |

¹ Built for them, not tested on them yet. ² Not yet tested against a server that has the module.

**In short.** Gajim comes closest on features. Hey Postie adds a real Mac app, full reactions,
the "read" state for the sender and an interface built for teams. Fluux, the other modern client,
has no encryption the phone apps can read. Still missing on our side: a public release, search
across all conversations, and link previews in one-to-one chats.

## Business model

The desktop client stays free and open source. Hey Postie intends to earn revenue from services that
require ongoing operational work:

1. deployment, compatibility work and support for organizations with an existing XMPP server;
2. managed XMPP spaces, once demand is validated;
3. later, team administration and support capabilities that do not turn federation into an
   artificial paywall.

External contacts, participants hosted elsewhere and the ability to federate are not paid seats.

## Run it from source

```sh
pnpm install
pnpm desktop:dev   # opens the app
pnpm verify        # types, lint, unit tests, Rust checks, build
```

Requirements: Node 24 or later, pnpm 12 and Rust stable through rustup. Linux also needs the WebKitGTK
development packages required by Tauri. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Repository

- `packages/core/`: TypeScript contracts, services and repositories over `@converse/headless`;
- `packages/ui/`: React interface, design system, screens and illustrations;
- `packages/mcp/`: local MCP tools over the core services;
- `apps/desktop/`: Tauri 2 desktop app, XMPP relay, keychain and notifications;
- `wiki/`: product decisions, feature specifications and technical guides.

## License

Copyright (C) 2026 Snouzylabs S.R.L. and the Hey Postie contributors.

Code and texts are licensed under [AGPL-3.0-or-later](LICENSE), with two additional terms in
[LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md): permission for app-store distribution and no trademark
rights. The Hey Postie name, logo and Postie character identify the official project; see
[BRAND.md](BRAND.md). Read the plain-language summary in [LICENSING.md](LICENSING.md).
