//! `hey-postie --smoke`: start, wait for the webview to say it rendered, exit 0. Exit 1 after a
//! timeout. Used by `pnpm desktop:smoke` and CI to prove the shell still boots.
//!
//! With `HEY_POSTIE_SMOKE_LOGIN="jid:password"` (debug builds only), the webview also signs in
//! through the relay and Converse: exit 0 on `smoke-online`, exit 1 on `smoke-failed` (the
//! payload is the error code) or after a longer timeout. `smoke-log` lines from the webview go
//! to stderr; they carry error names and codes, never message or stanza contents.
//!
//! With `HEY_POSTIE_SMOKE_DRIVE=1` on top, the app stays up after the sign-in and is driven by
//! a script (`scripts/smoke-scenario.mjs`): each stdin line is forwarded to the webview as a
//! `smoke-command` event, each `smoke-step` event of the webview is printed to stderr as
//! `smoke: step <json>` (step names and identifiers only), and `quit` or the end of stdin exits.

use std::io::BufRead;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Listener};

const RENDER_TIMEOUT: Duration = Duration::from_secs(20);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(40);
const DRIVE_TIMEOUT: Duration = Duration::from_secs(180);

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

/// `HEY_POSTIE_SMOKE_DRIVE=1`: the scripted scenario, which needs a sign-in to be meaningful.
pub fn driven_from_env(login: &Login) -> bool {
    login.0.is_some() && std::env::var("HEY_POSTIE_SMOKE_DRIVE").as_deref() == Ok("1")
}

pub fn arm(app: AppHandle, login: bool, driven: bool) {
    if login {
        app.listen("smoke-log", |event| {
            eprintln!("smoke: webview {}", event.payload())
        });
        let handle = app.clone();
        app.listen("smoke-online", move |_event| {
            eprintln!("smoke: signed in, the account is online");
            if !driven {
                exit(&handle, 0);
            }
        });
        let handle = app.clone();
        app.listen("smoke-failed", move |event| {
            eprintln!("smoke: sign-in failed with {}", event.payload());
            exit(&handle, 1);
        });
        if driven {
            drive(app.clone());
        }
    } else {
        let handle = app.clone();
        app.listen("smoke-ready", move |_event| {
            eprintln!("smoke: the interface rendered");
            exit(&handle, 0);
        });
    }
    let timeout = match (login, driven) {
        (true, true) => DRIVE_TIMEOUT,
        (true, false) => LOGIN_TIMEOUT,
        _ => RENDER_TIMEOUT,
    };
    std::thread::spawn(move || {
        std::thread::sleep(timeout);
        eprintln!("smoke: timed out after {} s", timeout.as_secs());
        exit(&app, 1);
    });
}

/// Steps go out on stderr, commands come in on stdin, one line each (see the module doc).
fn drive(app: AppHandle) {
    app.listen("smoke-step", |event| {
        eprintln!("smoke: step {}", event.payload())
    });
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            let line = match line {
                Ok(line) if line.trim() != "quit" => line,
                _ => break,
            };
            if let Err(error) = app.emit("smoke-command", line) {
                eprintln!("smoke: cannot forward a command: {error}");
            }
        }
        eprintln!("smoke: the driver is done");
        exit(&app, 0);
    });
}

/// `process::exit` skips `RunEvent::Exit`, so the single-instance socket is released by hand;
/// otherwise the next launch would find a stale one.
fn exit(app: &AppHandle, code: i32) -> ! {
    tauri_plugin_single_instance::destroy(app);
    std::process::exit(code)
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

    #[test]
    fn the_scenario_needs_a_login() {
        std::env::set_var("HEY_POSTIE_SMOKE_DRIVE", "1");
        assert!(!driven_from_env(&Login(None)));
        assert!(driven_from_env(&Login(Some(("a@b".into(), "pw".into())))));
        std::env::remove_var("HEY_POSTIE_SMOKE_DRIVE");
        assert!(!driven_from_env(&Login(Some(("a@b".into(), "pw".into())))));
    }
}
