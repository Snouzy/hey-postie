//! The main window. Closing it hides it (the app lives on in the tray); the tray, the dock, a
//! notification or an `xmpp:` link bring it back.

use tauri::{AppHandle, Manager, Runtime};

pub const MAIN: &str = "main";

/// Shows the main window, restores it when minimized, and gives it the focus.
pub fn show_main<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(MAIN) else {
        return Ok(());
    };
    window.show()?;
    window.unminimize()?;
    window.set_focus()
}
