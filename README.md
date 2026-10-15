# Hey Postie

A friendly XMPP chat client, end-to-end encrypted, for Mac, Windows and Linux. Free software.

**Status: in development. Nothing to download yet.**

Hey Postie is a modern replacement for Pidgin: one-to-one chats and rooms, OMEMO encryption, files
and images, reactions, system notifications, and the history of your server. XMPP only: it works
with any XMPP server and with the other clients (Conversations, Gajim, Monal, Dino…).

[Wiki](wiki/index.md) · [Contributing](CONTRIBUTING.md) · [Licensing](LICENSING.md) · [Brand](BRAND.md)

## Run it

```sh
pnpm install
pnpm desktop:dev   # opens the app
pnpm verify        # types, lint, unit tests, Rust checks, build
```

Node 24 or later, pnpm 12, Rust stable (through rustup). On Linux, the WebKitGTK development
packages that Tauri needs. Details in [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository

- `packages/core/`: the engine (TypeScript): contracts, services, repositories over `@converse/headless`.
- `packages/ui/`: the interface (React): design system, screens, Postie's illustrations, texts.
- `apps/desktop/`: the desktop app (Tauri 2), with its Rust side: XMPP relay, keychain, notifications.
- `wiki/`: product, specs and technical guide. Opens as an Obsidian vault.

## License

Copyright (C) 2026 Snouzylabs S.R.L. and the Hey Postie contributors.

Code and texts: [AGPL-3.0-or-later](LICENSE), with two additional terms in
[LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md): a permission for app-store distribution, and no
trademark rights. The name, the logo and Postie identify Hey Postie only: see [BRAND.md](BRAND.md).
Plain-language summary in [LICENSING.md](LICENSING.md).
