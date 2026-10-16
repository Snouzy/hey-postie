# Dependencies

Every runtime dependency, with its license and the reason it is here. Development-only tools are
listed at the end. Checked on 2026-10-15.

## Runtime

| Package | Version | License | Why |
|---|---|---|---|
| `@converse/headless` | 14.0.0 | MPL-2.0 | XMPP engine: MUC, MAM, OMEMO (0.3 and 2), reactions, upload, smacks. Pulls `strophe.js` (MIT), `libomemo.js` (GPL-3.0), `dompurify` (Apache-2.0 or MPL-2.0), `dayjs` (MIT), `lodash-es` (MIT). Installed in `packages/core` on 2026-10-15; its `curve25519_compiled.wasm` and `emoji.json` are copied to `apps/desktop/public/`, `libomemo.esm.min.js` is bundled by Vite as a lazy chunk (see [converse.md](converse.md) §12). |
| `react`, `react-dom` | 19.3.1 | MIT | Interface. |
| `lucide-react` | latest 0.x | ISC | Icons. |
| `@tauri-apps/api` and plugins (`notification`, `store`) | 2.x | MIT or Apache-2.0 | Bridge to the Rust side. |
| `@tauri-apps/plugin-opener` | 2.7.2 | MIT or Apache-2.0 | `openUrl`: links in messages go to the system browser (`apps/desktop/app/openLink.ts`). Added 2026-10-15. |
| `@tauri-apps/plugin-updater` | 2.14.0 | MIT or Apache-2.0 | `check()` for a newer release at startup (`apps/desktop/app/updater.ts`); `downloadAndInstall()` later, with the update screen. Added 2026-10-16. |
| `@tauri-apps/plugin-process` | 2.4.0 | MIT or Apache-2.0 | `relaunch()` after an update is installed. Not called yet. Added 2026-10-16. |
| Fraunces, Figtree | variable fonts | SIL OFL 1.1 | Headings and text, bundled. |

## Rust (`apps/desktop/src-tauri`)

| Crate | Version | License | Why |
|---|---|---|---|
| `tauri`, `tauri-build`, `tauri-plugin-notification`, `tauri-plugin-store` | 2.x | MIT or Apache-2.0 | Desktop shell. Tauri 3 was alpha on 2026-10-15; not used. `tauri` with the `tray-icon` feature (pulls `tray-icon`, MIT or Apache-2.0) for the menu bar icon. |
| `tauri-plugin-deep-link` | 2.6 | MIT or Apache-2.0 | Registers the `xmpp:` scheme and hands the links to the app. Rust side only; its npm package is not used. |
| `tauri-plugin-single-instance` | 2.5.4, feature `deep-link` | MIT or Apache-2.0 | A second instance (an `xmpp:` link on Windows or Linux starts one) hands its arguments to the running app and exits. Added 2026-10-15. |
| `tauri-plugin-opener` | 2.7.2 | MIT or Apache-2.0 | Rust side of `@tauri-apps/plugin-opener`. Added 2026-10-15. |
| `tauri-plugin-updater` | 2.14.0 | MIT or Apache-2.0 | Downloads `latest.json`, verifies the minisign signature (`minisign-verify`, MIT) of the artifact and installs it. Pulls `reqwest` 0.13 over `rustls` (MIT or Apache-2.0), `hyper`/`tower` (MIT), `zip` 4 (MIT), `tar`, `flate2` (MIT or Apache-2.0), `webpki-root-certs` (CDLA-Permissive-2.0, Mozilla's root store), `osakit` (MIT, macOS only). Added 2026-10-16; see [release.md](../product/release.md). |
| `tauri-plugin-process` | 2.4.0 | MIT or Apache-2.0 | `restart` command, so the webview can relaunch the app after an update. Added 2026-10-16. |
| `tauri-plugin-dialog` | 2.8.3 | MIT or Apache-2.0 | The save panel, driven from Rust (`save.rs`). Pulls `rfd` (MIT) and `tauri-plugin-fs` (MIT or Apache-2.0), whose commands are not exposed to the webview. Its npm package is not used. Added 2026-10-15. |
| `sys-locale` | 0.3.2 | MIT or Apache-2.0 | The system locale, to show the tray menu in French or English (`i18n.rs`). Added 2026-10-15. |
| `percent-encoding` | 2.3.2 | MIT or Apache-2.0 | Decodes the file name header of `save_file`. Already in the tree through `url`. Added 2026-10-15. |
| `keyring` | 4.x | MIT or Apache-2.0 | OS keychain for passwords. |
| `serde`, `serde_json` | 1.x | MIT or Apache-2.0 | Command arguments. |
| `thiserror` | 2.x | MIT or Apache-2.0 | Error types. |
| `tokio` | 1.53.3 | MIT | Async runtime pieces the relay needs (`net`, `io-util`, `time`, `sync`, `macros`, `rt-multi-thread`); the runtime itself is Tauri's. |
| `tokio-tungstenite` | 0.30.0 | MIT | WebSocket server side of the relay (client side in tests). |
| `tokio-rustls` | 0.26.6 | MIT or Apache-2.0 | TLS towards the XMPP server, over `rustls` 0.23 with the `ring` provider (ISC and OpenSSL-style licenses; no C toolchain needed, unlike the default `aws-lc-rs`). |
| `rustls-platform-verifier` | 0.7.1 | MIT or Apache-2.0 | Hands the server's certificate chain to the OS verifier (Security framework, CryptoAPI), so the relay trusts what the system trusts, fetches a missing intermediate from the AIA address, and gets OS revocation checks. Replaced `rustls-native-certs` on 2026-10-16: a real server sends its leaf without its CA's intermediate certificate, webpki refused it (`UnknownIssuer`) while macOS and Gajim accept it. Already in the tree through `reqwest` (updater). Linux falls back to webpki with the system roots (`relay/tls.rs`). |
| `hickory-resolver` | 0.26.3 | MIT or Apache-2.0 | SRV lookups with the system's DNS configuration. |
| `quick-xml` | 0.42.0 | MIT | Attribute parsing of `<open/>` and `<stream:stream>`. |
| `futures-util` | 0.3.34 | MIT or Apache-2.0 | `Stream`/`Sink` extension traits for the WebSocket. Already pulled by `tokio-tungstenite`. |
| `rand` | 0.10.3 | MIT or Apache-2.0 | The relay token and the SRV weighted draw. |
| `log` | 0.4.34 | MIT or Apache-2.0 | Relay events behind `RELAY_DEBUG`; silent otherwise. |

## The licenses file

`pnpm run licenses` runs `apps/desktop/scripts/licenses.mjs`, which writes
`packages/ui/src/data/licenses.json`: one entry per shipped dependency (`source`: `npm`, `cargo`
or `font`; `name`, `version`, `license`, `repository`), for the "Licenses" dialog of the interface.
npm entries come from `pnpm -r licenses list --prod --json` (runtime dependencies of every
workspace package; `repository` read from each `package.json`), Rust entries from
`cargo metadata` (normal dependencies of the desktop crate, union of the macOS, Windows and Linux
targets; dev and build dependencies left out), the two fonts are written by hand in the script
since they are not packages. Two packages without a `license` field (`@converse/localforage-getitems`,
`localforage-setitems`) are Apache-2.0 by their `LICENSE` file; the script carries that by hand.
Run it after adding or upgrading a dependency and commit the file. Generated on 2026-10-16:
524 entries, including `@converse/headless` (MPL-2.0), `libomemo.js` (GPL-3.0), the fonts (OFL-1.1)
and the `tauri` crates.

## Development

TypeScript 6, Biome 2, Vitest 5, Vite 8, `@vitejs/plugin-react`, Testing Library, jsdom
(30.1.3 in `packages/core`, for the Converse repository tests), `@tauri-apps/cli` 2.12. All MIT or
Apache-2.0.

`astro` 7.3.8 (MIT) builds the marketing site (`apps/site/`, see its README): static HTML, no
framework integration, nothing shipped in the app. It pulls Vite and its own plugins (MIT). Its CLI
telemetry is disabled in the package scripts. Added 2026-10-16.

Rust, `[dev-dependencies]`: `rcgen` 0.14.10 (MIT or Apache-2.0), a self-signed certificate for the
relay's certificate-rejection test; `proptest` 1.12.0 (MIT or Apache-2.0; pulls `rusty-fork`,
`bit-set`, `unarray`, `wait-timeout`, `rand_xorshift`, all MIT or Apache-2.0), property-based
tests of the relay's parsing (`relay/framing/property_tests.rs`, `relay/framing/splitter/property_tests.rs`,
`relay/resolve/property_tests.rs`, and the `properties` modules of `relay/server.rs`,
`relay/tls.rs`, `relay/connect/tests.rs`). Added 2026-10-16. Failing cases are saved under
`apps/desktop/src-tauri/proptest-regressions/`, committed so that every run replays them.

### Local XMPP test server (`tools/xmpp-server/`, dev only, never shipped)

| Tool | Version | License | Why |
|---|---|---|---|
| Prosody | 13.0.7, built from source by `install.sh` | MIT | XMPP server on `localhost` for development and contract tests. Not in Homebrew (checked on 2026-10-15). |
| Lua rocks: luasocket, luaexpat, luafilesystem, luasec | 3.1.0, 1.5.2, 1.9.0, 1.3.2 | MIT | Prosody's runtime libraries, installed in a local tree. |
| mkcert | 1.4.4 (Homebrew) | BSD-3-Clause | Locally trusted TLS certificate for `localhost`. |
| Homebrew: `lua@5.4`, `luarocks`, `openssl@3`, `icu4c@78` | 5.4.9, 3.13, 3.5, 78 | MIT, MIT, Apache-2.0, ICU | Build and runtime dependencies of Prosody. |
