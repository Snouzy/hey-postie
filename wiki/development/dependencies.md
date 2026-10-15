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

Milestone 1 adds `tokio`, `tokio-tungstenite`, `tokio-rustls`, `rustls-native-certs`,
`hickory-resolver`, `quick-xml` for the relay (all MIT or Apache-2.0; `hickory-resolver` MIT or Apache-2.0).

## Development

TypeScript 6, Biome 2, Vitest 5, Vite 8, `@vitejs/plugin-react`, Testing Library, jsdom
(30.1.3 in `packages/core`, for the Converse repository tests), `@tauri-apps/cli` 2.12. All MIT or
Apache-2.0.
