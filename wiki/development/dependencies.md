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
| Fraunces, Figtree | variable fonts | SIL OFL 1.1 | Headings and text, bundled. |

## Rust (`apps/desktop/src-tauri`)

| Crate | Version | License | Why |
|---|---|---|---|
| `tauri`, `tauri-build`, `tauri-plugin-notification`, `tauri-plugin-store` | 2.x | MIT or Apache-2.0 | Desktop shell. Tauri 3 was alpha on 2026-10-15; not used. |
| `keyring` | 4.x | MIT or Apache-2.0 | OS keychain for passwords. |
| `serde`, `serde_json` | 1.x | MIT or Apache-2.0 | Command arguments. |
| `thiserror` | 2.x | MIT or Apache-2.0 | Error types. |
| `tokio` | 1.53.3 | MIT | Async runtime pieces the relay needs (`net`, `io-util`, `time`, `sync`, `macros`, `rt-multi-thread`); the runtime itself is Tauri's. |
| `tokio-tungstenite` | 0.30.0 | MIT | WebSocket server side of the relay (client side in tests). |
| `tokio-rustls` | 0.26.6 | MIT or Apache-2.0 | TLS towards the XMPP server, over `rustls` 0.23 with the `ring` provider (ISC and OpenSSL-style licenses; no C toolchain needed, unlike the default `aws-lc-rs`). |
| `rustls-native-certs` | 0.8.5 | MIT or Apache-2.0 or ISC | Loads the OS root certificates. Chosen over `rustls-platform-verifier`: pure Rust, same behaviour on every platform; no OS revocation checks (decision of 2026-10-15, `relay/tls.rs`). |
| `hickory-resolver` | 0.26.3 | MIT or Apache-2.0 | SRV lookups with the system's DNS configuration. |
| `quick-xml` | 0.42.0 | MIT | Attribute parsing of `<open/>` and `<stream:stream>`. |
| `futures-util` | 0.3.34 | MIT or Apache-2.0 | `Stream`/`Sink` extension traits for the WebSocket. Already pulled by `tokio-tungstenite`. |
| `rand` | 0.10.3 | MIT or Apache-2.0 | The relay token and the SRV weighted draw. |
| `log` | 0.4.34 | MIT or Apache-2.0 | Relay events behind `RELAY_DEBUG`; silent otherwise. |

## Development

TypeScript 6, Biome 2, Vitest 5, Vite 8, `@vitejs/plugin-react`, Testing Library, jsdom
(30.1.3 in `packages/core`, for the Converse repository tests), `@tauri-apps/cli` 2.12. All MIT or
Apache-2.0.

Rust, `[dev-dependencies]`: `rcgen` 0.14.10 (MIT or Apache-2.0), a self-signed certificate for the
relay's certificate-rejection test.
