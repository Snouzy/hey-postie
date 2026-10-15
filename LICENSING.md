# Licensing

Copyright (C) 2026 Snouzylabs S.R.L. and the Hey Postie contributors. Snouzylabs S.R.L. publishes Hey Postie.

This page is a plain-language guide. What binds is the license text in [LICENSE](LICENSE) and the additional terms in [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md).

## 1. The code and the texts: AGPL-3.0-or-later

Everything in this repository that is not a third-party component listed below is free software under the GNU Affero General Public License, version 3 or any later version: the engine in `packages/core/`, the interface in `packages/ui/` (its code, its texts, the source files of its illustrations), the desktop app in `apps/desktop/`, the wiki, the tools and the tests.

In short: you may use, study, change and redistribute it, including commercially, as long as the people who receive it, or who use a modified version over a network, can get the corresponding source under the same license.

Two additional terms under section 7 come with it, in [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md): a permission to distribute builds through application stores, and a reminder that the license grants no trademark rights. Copy that file along with `LICENSE` when you redistribute.

## 2. The brand: a trademark matter

The source files of the logo and of the Postie illustrations ship with the code, under the AGPL, so that anyone can build and run the app. What stays reserved is the use of the name "Hey Postie", the logo and Postie to identify a product, site or service that is not Hey Postie. That is trademark law, not copyright on the files. [BRAND.md](BRAND.md) says what you may do without asking, and what a fork must change.

## 3. Third-party components

The app ships these components, each under its own license. The full list, with every dependency, is kept in [`wiki/development/dependencies.md`](wiki/development/dependencies.md) and shown in the app under Settings › About › Licenses.

| Component | Role | License |
|---|---|---|
| Converse.js (`@converse/headless`) | XMPP engine | MPL-2.0 |
| libomemo.js and libsignal-protocol code | OMEMO end-to-end encryption | GPL-3.0 |
| Strophe.js | XMPP over WebSocket | MIT |
| Tauri 2 and its plugins, with the Rust crates they pull in | Desktop shell | MIT or Apache-2.0 |
| React | Interface | MIT |
| Fraunces, Figtree | Fonts | SIL Open Font License 1.1 |
| Lucide | Icons | ISC |

These are free licenses that can accompany AGPL code. The additional permission above does not extend to them. One point is open and tracked in the wiki: the GPL-3.0 code of OMEMO and distribution through application stores. Several (A)GPL chat apps ship on the stores today; this is not a lawyer's opinion.

## Contributions

By contributing you certify the [Developer Certificate of Origin](https://developercertificate.org/) (`git commit -s`) and agree that your contribution is licensed under AGPL-3.0-or-later with the additional terms in [LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md). There is no contributor license agreement and no copyright assignment: what you write stays yours, under the same terms as everything else here.
