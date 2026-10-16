//! The main window. Closing it hides it (the app lives on in the tray); the tray, the dock, a
//! notification or an `xmpp:` link bring it back.

use tauri::{AppHandle, Manager, Runtime};

pub const MAIN: &str = "main";

/// Whether this is a `--smoke` run: then the window is shown but never given the focus, so a
/// scripted run does not steal the screen from whoever is working on the machine.
pub struct Smoke(pub bool);

/// Shows the main window, restores it when minimized, and gives it the focus (not in smoke mode).
pub fn show_main<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(MAIN) else {
        return Ok(());
    };
    window.show()?;
    window.unminimize()?;
    if app.state::<Smoke>().0 {
        return Ok(());
    }
    window.set_focus()
}
