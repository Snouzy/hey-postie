<div align="center">

<img src="apps/desktop/src-tauri/icons/icon.png" width="96" alt="Hey Postie">

# Hey Postie

**A modern desktop chat app for XMPP: your server, your rules, a friendly app.**

macOS · Windows · Linux · OMEMO end-to-end encryption · AI agents over MCP and CLI, off by default · Free software (AGPL)

https://github.com/user-attachments/assets/9db9c88e-9c1c-4163-825b-9db26ada2a22

**In active development: no public download yet.**
[Join an early pilot](mailto:contact@snouzy.com?subject=Hey%20Postie%20early%20pilot) ·
[Wiki](wiki/index.md) · [Contribute](CONTRIBUTING.md)

</div>

---

**On this page:** [What is XMPP?](#what-is-xmpp) · [What you get](#what-you-get) ·
[How it compares](#how-it-compares) · [For teams](#for-teams) · [Run it from source](#run-it-from-source) ·
[License](#license)

## What is XMPP?

XMPP is to chat what email is to letters: an open standard (IETF, since 1999) that no company owns.
Every organization can run its own server, addresses look like `alice@your-company.com`, and anyone
on one server can talk to anyone on another. Many apps speak it: Conversations, Gajim, Monal, Dino…
and Hey Postie, which keeps your server and gives your team a modern desktop app on top of it.

## What you get

| | |
|---|---|
| 💬 **Conversations and rooms** | One-to-one chats and group rooms ("halls"): replies, reactions, mentions, edit and delete, files and images. |
| 🔒 **Private by design** | OMEMO end-to-end encryption that phone apps can read; secrets in the OS keychain; no ads, no analytics. |
| 🔎 **Find things** | Search in a conversation; its media, links and documents in one place; read state synced across your devices. |
| 🤖 **AI agents, on your terms** | A local MCP server and the `postie` command line, for Claude and any other agent, off by default, with separate read, draft and send levels. Direct sending needs the highest level, which you choose in the app. |
| 🌐 **Open network** | Works with your current XMPP server (Prosody, ejabberd, Openfire…) and with everyone on other servers. |

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
| AI agents | ✅ MCP (12 tools) and CLI, sending only at the level you allow | ❌ | ❌ | ❌ | ✅ 3 tools | ❌ | ❌ |
| Latest release | none yet | 2.6.0 (Aug 2026) | 0.5.1 (Nov 2025) | 2.14.14 (Jan 2025) | 0.17.4 (Sep 2026) | 14.0.0 (Jun 2026) | 6.4.23 (Oct 2026) |
| License | AGPL-3.0 | GPL-3.0 | GPL-3.0 | GPL-2.0 | AGPL-3.0 | MPL-2.0 | BSD-2 |

¹ Built for them, not tested on them yet. ² Not yet tested against a server that has the module.

**In short.** Gajim comes closest on features. Hey Postie adds a real Mac app, full reactions,
the "read" state for the sender and an interface built for teams. Fluux, the other modern client,
has no encryption the phone apps can read. Still missing on our side: a public release, search
across all conversations, and link previews in one-to-one chats.

## For teams

**Already running XMPP?** Keep Prosody, ejabberd, Openfire or your provider: Hey Postie becomes your
team's desktop client without moving accounts or breaking federation. Our first pilots cover
compatibility checks against your setup, packaging and managed deployment, migration from Pidgin,
onboarding, updates and support. The client stays free software.
[Discuss a deployment pilot](mailto:contact@snouzy.com?subject=Hey%20Postie%20deployment%20pilot)

**Need the server managed too?** A managed Hey Postie space (server, accounts, domain, backups,
monitoring, updates, support) is being validated, not available yet. It would be billed per local
account hosted for your organization, never for the people they talk to on other servers.
[Ask about the managed pilot](mailto:contact@snouzy.com?subject=Hey%20Postie%20managed%20pilot)

**How we make money.** From services that need ongoing work: deployment and support for existing
servers first, managed spaces once teams ask for them, then team administration. Federation and
external contacts are never paid seats.

## Run it from source

```sh
pnpm install
pnpm desktop:dev   # opens the app
pnpm verify        # types, lint, unit tests, Rust checks, build
```

Requirements: Node 24 or later, pnpm 12 and Rust stable through rustup. Linux also needs the WebKitGTK
development packages required by Tauri. Details in [CONTRIBUTING.md](CONTRIBUTING.md).

<details>
<summary>Repository layout</summary>

- `packages/core/`: TypeScript contracts, services and repositories over `@converse/headless`;
- `packages/ui/`: React interface, design system, screens and illustrations;
- `packages/mcp/`: local MCP tools over the core services;
- `apps/cli/`: `postie`, a command line for AI agents over the same MCP tools;
- `apps/desktop/`: Tauri 2 desktop app, XMPP relay, keychain and notifications;
- `wiki/`: product decisions, feature specifications and technical guides.

</details>

## License

Copyright (C) 2026 Snouzylabs S.R.L. and the Hey Postie contributors.

Code and texts are licensed under [AGPL-3.0-or-later](LICENSE), with two additional terms in
[LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md): permission for app-store distribution and no trademark
rights. The Hey Postie name, logo and Postie character identify the official project; see
[BRAND.md](BRAND.md). Read the plain-language summary in [LICENSING.md](LICENSING.md).
