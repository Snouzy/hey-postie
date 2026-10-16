# Cutting a release

How a version of Hey Postie goes from the repository to users' machines. Everything runs on the
author's machine (decision of 2026-10-15: no CI). Written on 2026-10-16 against Tauri CLI 2.12.3
and `tauri-plugin-updater` 2.14.0; the macOS steps were run (unsigned build), the Windows, Linux
and store steps come from the Tauri and Apple documentation and are marked as such.

## What ships

Configured in `apps/desktop/src-tauri/tauri.conf.json`, `bundle` section.

| Platform | Installers (`bundle.targets`) | Updater artifacts (`createUpdaterArtifacts: true`) |
|---|---|---|
| macOS | `Hey Postie.app`, `Hey Postie_<v>_aarch64.dmg` (or `_x64`) | `Hey Postie.app.tar.gz` + `.sig` |
| Windows | `Hey Postie_<v>_x64-setup.exe` (NSIS), `Hey Postie_<v>_x64_en-US.msi` | the same two files + `.sig` |
| Linux | `Hey Postie_<v>_amd64.AppImage`, `Hey Postie_<v>_amd64.deb` | the AppImage + `.sig` |

`bundle.targets` is the explicit list `["app", "dmg", "nsis", "msi", "appimage", "deb"]` rather
than `"all"`: `tauri build` only builds the targets of the platform it runs on, so the list is
what each platform produces, and `"all"` would add `rpm`, which we do not publish. The `.deb`
declares `libwebkit2gtk-4.1-0` (`bundle.linux.deb.depends`), the WebKitGTK that Tauri 2 links.
Windows installers download the WebView2 bootstrapper when the runtime is missing
(`webviewInstallMode: downloadBootstrapper`), which keeps them small.

The metadata (publisher `Snouzylabs S.R.L.`, category `SocialNetworking`, short and long
descriptions from the README, copyright, `licenseFile` pointing at the repository `LICENSE`) is read
by the DMG, the installers and the `.deb` control file.

Artifacts land in `apps/desktop/src-tauri/target/release/bundle/<format>/`.

## The version

One source of truth: `version` in `apps/desktop/src-tauri/tauri.conf.json`. It has to be repeated
in `Cargo.toml`, `Cargo.lock` and the three `package.json` (`apps/desktop`, `packages/core`,
`packages/ui`), so `pnpm version:set <x.y.z>` (`scripts/version-set.mjs`) writes all six. Vite
reads the same file and injects `import.meta.env.VITE_APP_VERSION` (`apps/desktop/vite.config.ts`);
`apps/desktop/app/main.tsx` passes it to `App` as the `version` prop, shown in Settings > About.
Current version: `0.1.0`.

## Steps

1. `pnpm version:set 0.1.1` (semver; `x.y.z-beta.1` is accepted by the script, the updater compares
   versions with semver rules).
2. Write the release notes by hand (no tool yet).
3. `pnpm release:build` = `pnpm verify && pnpm desktop:build`: types, lint, tests, Rust checks, the
   Vite build, then `tauri build` with the bundles above for the current platform. Repeat on each
   platform (macOS, Windows, Linux): there is no cross-compilation for the bundles.
4. Sign (see below), per platform.
5. Upload the installers and the updater artifacts, then write `latest.json` (see "The updater").
6. Commit the version change on a branch; tag `v0.1.1` once merged. Both need the author's go-ahead.

### Updater signing (every platform)

`createUpdaterArtifacts: true` makes `tauri build` sign the updater artifacts with a minisign key,
and **the build fails without the private key** ("A public key has been found, but no private
key"). So the build always needs:

```sh
export TAURI_SIGNING_PRIVATE_KEY=~/.tauri/hey-postie.key     # path or the key's content
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""                  # the key has no password today
```

- The key pair was generated on 2026-10-16 with `pnpm tauri signer generate -w ~/.tauri/hey-postie.key --ci`.
  The public key is `plugins.updater.pubkey` in `tauri.conf.json`. The private key lives in
  `~/.tauri/hey-postie.key` on the author's machine and nowhere else: not in git, not in the wiki.
  Keep a copy in the author's password manager. Losing it means no existing install can verify a
  future update; users would have to download the app again.
- `--ci` produced a key without password. To add one, regenerate with `-p`, replace the `pubkey`
  in the config and ship a release before any user installs the old public key (there is no user
  yet, so this is free until the first release).
- A build without updater artifacts, for a local check, is `pnpm tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'`
  from `apps/desktop` (the `--config` flag merges a JSON override).

### macOS: signing and notarization

Not run yet (no Developer ID certificate on 2026-10-16). Tauri reads these variables; nothing to
change in the config, where `signingIdentity` is `null` on purpose (JSON has no comments, so the
instructions are here):

```sh
export APPLE_SIGNING_IDENTITY="Developer ID Application: Snouzylabs S.R.L. (TEAMID)"
export APPLE_ID="<apple id email>"
export APPLE_PASSWORD="<app-specific password>"
export APPLE_TEAM_ID="<TEAMID>"
```

With `APPLE_SIGNING_IDENTITY` set, `tauri build` signs the `.app` with the hardened runtime
(`bundle.macOS.hardenedRuntime: true`) and `Entitlements.plist`, and with the three `APPLE_*`
variables it also notarizes and staples the `.dmg`. Without them the `.app` is ad-hoc signed and
Gatekeeper refuses it on another Mac (right-click > Open still works). `minimumSystemVersion` is
`12.0` (Monterey). Source: Tauri "macOS Code Signing" guide, consulted 2026-10-16.

The entitlements enable the App Store sandbox from the first build (see
[technical-guide.md](../development/technical-guide.md), Desktop). The sandbox is compatible with
the direct (Developer ID) build: the keychain, the save panel and the relay on `127.0.0.1` all work
in the unsigned build run on 2026-10-16.

### Windows: signing

Not run (no Windows machine, no certificate). `bundle.windows.certificateThumbprint` is `null`;
set it to the SHA-1 thumbprint of a code-signing certificate installed in the user's certificate
store, and `tauri build` signs the `.exe`, the installers and the updater artifacts with
`signtool`. Alternatively, Azure Code Signing or a custom `signCommand` (Tauri "Windows Code
Signing" guide, consulted 2026-10-16). Unsigned installers trigger SmartScreen warnings.

### Linux

Not run. `pnpm release:build` on Debian/Ubuntu with the Tauri prerequisites
(`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`) produces the
AppImage and the `.deb`. The AppImage is the updater's target on Linux; the `.deb` is updated by
the package manager, so the updater is a no-op there (the plugin only updates AppImage installs).
Flatpak (spec, section 6) is not configured.

## The updater

`tauri-plugin-updater` (Rust) and `@tauri-apps/plugin-updater` (TypeScript), plus
`tauri-plugin-process` for the relaunch after an install. `apps/desktop/app/updater.ts`:

- At startup, after the other desktop integrations, at most once an hour across restarts
  (`lastCheckedAt` in the `updater.json` store of `tauri-plugin-store`; unit test
  `updater.test.ts`). A failed check is a warning in the console, never an error to the user.
- When a newer version exists, the webview emits the Tauri event `update-available` with
  `{ version, currentVersion }` and logs the event name. No interface yet: downloading and
  installing (`update.downloadAndInstall()`, then `relaunch()` from `@tauri-apps/plugin-process`)
  come with the screen that shows the update. Capabilities `updater:default` and
  `process:allow-restart` are already granted (`src-tauri/capabilities/default.json`).

The endpoint is `https://hey-postie.com/releases/latest.json` (placeholder: the domain is
still to confirm, see [brand.md](brand.md)). A static file, rewritten at each release. The
marketing site (`apps/site/public/releases/latest.json`) serves a placeholder for `0.1.0` with
`PLACEHOLDER` signatures until the first build is published:

```json
{
  "version": "0.1.1",
  "notes": "What changed, in one paragraph.",
  "pub_date": "2026-11-01T10:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "<content of Hey Postie.app.tar.gz.sig>", "url": "https://hey-postie.com/releases/0.1.1/Hey.Postie_aarch64.app.tar.gz" },
    "darwin-x86_64": { "signature": "...", "url": "https://hey-postie.com/releases/0.1.1/Hey.Postie_x64.app.tar.gz" },
    "windows-x86_64": { "signature": "...", "url": "https://hey-postie.com/releases/0.1.1/Hey.Postie_0.1.1_x64-setup.exe" },
    "linux-x86_64": { "signature": "...", "url": "https://hey-postie.com/releases/0.1.1/Hey.Postie_0.1.1_amd64.AppImage" }
  }
}
```

The `signature` is the text of the `.sig` file next to each artifact. The plugin downloads the
file for the running platform, checks the signature against `pubkey`, installs, and the app
relaunches. Users on a `.deb` or on the App Store do not use this path. Source: Tauri "Updater"
plugin guide, consulted 2026-10-16.

## App Store (macOS)

Not done; the steps, from Apple's and Tauri's documentation (consulted 2026-10-16):

1. In App Store Connect: create the app with the bundle identifier `com.snouzylabs.heypostie`,
   and in Certificates: a "Mac App Distribution" and a "Mac Installer Distribution" certificate,
   plus a Mac App Store provisioning profile for that identifier.
2. Build a universal binary: `pnpm tauri build --target universal-apple-darwin` from `apps/desktop`
   (both Rust targets installed with `rustup target add aarch64-apple-darwin x86_64-apple-darwin`),
   with `APPLE_SIGNING_IDENTITY` set to the "3rd Party Mac Developer Application" identity, the
   provisioning profile embedded (`bundle.macOS.files` or the `embedded.provisionprofile`
   convention) and the updater disabled in that build (`--config '{"bundle":{"createUpdaterArtifacts":false}}'`:
   the Store delivers updates).
3. `xcrun productbuild --sign "3rd Party Mac Developer Installer: ..." --component "Hey Postie.app" /Applications "Hey Postie.pkg"`,
   then upload with `xcrun altool --upload-app` or the Transporter app.
4. Submit for review with the listing below.

The sandbox entitlements (`Entitlements.plist`: `app-sandbox`, `network.client`, `network.server`,
`files.user-selected.read-write`) are already the Store's requirements. `network.server` (added
2026-10-16) covers the two loopback listeners, the XMPP relay and the MCP endpoint, both on
`127.0.0.1` only; to confirm in the first Store build. Claude's access sends message text to a
third-party AI: the App Review wording on that consent is still to check (MCP spec, points to check).

### Store listing checklist

- Account deletion in the app (App Store rule 5.1.1(v)): the service exists
  (`packages/core/src/services/accounts.ts`, XEP-0077 remove); the Settings entry that calls it is
  part of milestone 5 (check it is reachable before submitting).
- Privacy "nutrition labels", what the app accesses, checked against the code on 2026-10-16:
  - Network: the XMPP server the user chose (and its HTTP upload service for files); the release
    server `hey-postie.com` for the update check (version numbers only, no identifier).
  - Stored on the device: the account password in the OS keychain (`keychain.rs`), messages,
    roster and OMEMO keys in the webview's IndexedDB (`@converse/headless`), preferences in
    `localStorage` and `tauri-plugin-store` files. Nothing leaves the device except to the user's
    XMPP server.
  - No analytics, no crash reporting, no advertising identifiers, no third-party SDK that collects
    data. Declare "Data Not Collected" for the publisher; the user's messages and contacts are
    "not linked, not collected" by us since they go to their own server.
  - Files: only the ones the user picks or saves (save panel, `save.rs`).
  - Notifications: system notifications for messages (`tauri-plugin-notification`), with an
    in-app setting to hide the preview.
- Age rating: user-generated content with no moderation by us (users talk to their own servers):
  expect 17+ or a "Unrestricted Web Access"-like flag; to settle at submission.
- Export compliance: OMEMO uses standard encryption (libsignal, AES-GCM). The usual exemption for
  standard encryption applies (`ITSAppUsesNonExemptEncryption` false, with the self-classification
  report) but this is not a lawyer's opinion.
- Licenses: `libomemo.js` is GPL-3.0 and the App Store terms are a known grey zone
  ([decisions.md](decisions.md), "Points to check"). Our own code carries the app-store additional
  permission (`LICENSE-EXCEPTION.md`).
- Screenshots: 1280x800 or 1440x900 minimum; the window's default size is 1100x720, so capture
  at 1440x900 with the window enlarged.

## Points to check

- The release domain and the `latest.json` hosting (static hosting is enough).
- Whether the Store review accepts `network.server` for the two `127.0.0.1` listeners (the relay
  and the MCP endpoint). The unsigned sandboxed build works locally; the Store build is the one to
  test.
- Windows: MSIX for the Microsoft Store (spec, section 6) is not configured; NSIS and MSI are.
