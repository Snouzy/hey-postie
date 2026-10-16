//! macOS: in `tauri dev`, notifications show under the Hey Postie identity instead of Terminal's.
//!
//! The notification plugin sends in the name of `com.apple.Terminal` whenever `tauri::is_dev()`
//! (tauri-plugin-notification 2.7.0, `src/desktop.rs`). `mac-notification-sys` takes only the
//! first application name it is given for the whole process (a `Once`), so claiming the app's own
//! identifier at startup, before any notification, makes the plugin's later Terminal claim a no-op.
//! The claim succeeds only when Launch Services knows an app with that identifier: the bundled
//! Hey Postie, opened once. Otherwise notifications keep coming from Terminal, as before.

/// What the developer reads in the `pnpm desktop:dev` terminal when the claim fails.
const NOT_INSTALLED_HINT: &str = "notifications: macOS does not know Hey Postie yet, so dev \
notifications come from Terminal. Once: `pnpm desktop:build`, copy the .app from \
apps/desktop/src-tauri/target/release/bundle/macos/ to /Applications, open it, and allow Hey Postie in System \
Settings > Notifications.";

/// Claims `identifier` for this run's notifications. Only in dev: a bundled app already has it.
pub fn claim(identifier: &str) {
    if !tauri::is_dev() {
        return;
    }
    if !try_claim(identifier) {
        eprintln!("{NOT_INSTALLED_HINT}");
    }
}

fn try_claim(identifier: &str) -> bool {
    notify_rust::set_application(identifier).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_identifier_no_installed_app_has_is_refused() {
        assert!(!try_claim("org.example.no-such-app-for-hey-postie-tests"));
    }
}
