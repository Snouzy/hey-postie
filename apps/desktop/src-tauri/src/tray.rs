//! The menu bar / tray icon: "Open Hey Postie", "Quit", and the unread count (text next to the
//! icon on macOS, in the tooltip everywhere, in the dock badge on macOS).

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Runtime};

use crate::window;

const TRAY_ID: &str = "main";
const OPEN: &str = "open";
const QUIT: &str = "quit";

pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, OPEN, "Open Hey Postie", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Hey Postie")
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN => {
                if let Err(error) = window::show_main(app) {
                    eprintln!("tray: cannot show the window: {error}");
                }
            }
            QUIT => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Shows `count` unread messages next to the tray icon and on the dock badge; `0` clears both.
pub fn set_unread<R: Runtime>(app: &AppHandle<R>, count: u32) -> tauri::Result<()> {
    let label = (count > 0).then(|| count.to_string());
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_tooltip(Some(match &label {
            Some(label) => format!("Hey Postie: {label} unread"),
            None => "Hey Postie".to_owned(),
        }))?;
        #[cfg(target_os = "macos")]
        tray.set_title(label.as_deref())?;
    }
    // The dock badge (macOS) or the launcher badge (Linux). Windows has no badge count.
    #[cfg(not(windows))]
    if let Some(window) = app.get_webview_window(window::MAIN) {
        window.set_badge_count(label.map(|_| i64::from(count)))?;
    }
    Ok(())
}
