//! `hey-postie --smoke`: start, wait for the webview to say it rendered, exit 0. Exit 1 after a
//! timeout. Used by `pnpm desktop:smoke` and CI to prove the shell still boots.
//!
//! With `HEY_POSTIE_SMOKE_LOGIN="jid:password"` (debug builds only), the webview also signs in
//! through the relay and Converse: exit 0 on `smoke-online`, exit 1 on `smoke-failed` (the
//! payload is the error code) or after a longer timeout. `smoke-log` lines from the webview go
//! to stderr; they carry error names and codes, never message or stanza contents.

use std::time::Duration;
use tauri::{AppHandle, Listener};

const RENDER_TIMEOUT: Duration = Duration::from_secs(20);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(40);

/// The credentials of the smoke sign-in, handed to the webview by the `smoke_login` command.
pub struct Login(pub Option<(String, String)>);

/// `HEY_POSTIE_SMOKE_LOGIN` as `(jid, password)`, in debug builds with `--smoke` only.
pub fn login_from_env(smoke: bool) -> Login {
    if !smoke || !cfg!(debug_assertions) {
        return Login(None);
    }
    let value = std::env::var("HEY_POSTIE_SMOKE_LOGIN").ok();
    Login(value.and_then(|value| {
        value
            .split_once(':')
            .map(|(jid, password)| (jid.to_owned(), password.to_owned()))
    }))
}

pub fn arm(app: AppHandle, login: bool) {
    if login {
        app.listen("smoke-log", |event| {
            eprintln!("smoke: webview {}", event.payload())
        });
        app.listen("smoke-online", |_event| {
            eprintln!("smoke: signed in, the account is online");
            std::process::exit(0);
        });
        app.listen("smoke-failed", |event| {
            eprintln!("smoke: sign-in failed with {}", event.payload());
            std::process::exit(1);
        });
    } else {
        app.listen("smoke-ready", |_event| {
            eprintln!("smoke: the interface rendered");
            std::process::exit(0);
        });
    }
    let timeout = if login { LOGIN_TIMEOUT } else { RENDER_TIMEOUT };
    std::thread::spawn(move || {
        std::thread::sleep(timeout);
        eprintln!("smoke: timed out after {} s", timeout.as_secs());
        std::process::exit(1);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_login_needs_the_smoke_flag() {
        std::env::set_var("HEY_POSTIE_SMOKE_LOGIN", "alice@localhost:pw:x");
        assert!(login_from_env(false).0.is_none());
        assert_eq!(
            login_from_env(true).0,
            Some(("alice@localhost".into(), "pw:x".into()))
        );
        std::env::remove_var("HEY_POSTIE_SMOKE_LOGIN");
        assert!(login_from_env(true).0.is_none());
    }
}
