//! `hey-postie --smoke`: start, wait for the webview to say it rendered, exit 0. Exit 1 after a
//! timeout. Used by `pnpm desktop:smoke` and CI to prove the shell still boots.

use std::time::Duration;
use tauri::{AppHandle, Listener};

const TIMEOUT: Duration = Duration::from_secs(20);

pub fn arm(app: AppHandle) {
    app.listen("smoke-ready", |_event| {
        eprintln!("smoke: the interface rendered");
        std::process::exit(0);
    });
    std::thread::spawn(|| {
        std::thread::sleep(TIMEOUT);
        eprintln!("smoke: timed out after {} s", TIMEOUT.as_secs());
        std::process::exit(1);
    });
}
