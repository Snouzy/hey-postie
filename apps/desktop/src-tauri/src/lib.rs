//! The Rust side of Hey Postie: plugins, commands, tray, links, and the `--smoke` self-check.

mod keychain;
mod links;
mod relay;
mod smoke;
mod tray;
mod window;

use tauri::{AppHandle, WindowEvent};

use tauri::Manager;

#[tauri::command]
fn keychain_get(jid: String) -> Result<Option<String>, String> {
    keychain::get(&jid).map_err(|error| error.to_string())
}

#[tauri::command]
fn keychain_set(jid: String, password: String) -> Result<(), String> {
    keychain::set(&jid, &password).map_err(|error| error.to_string())
}

#[tauri::command]
fn keychain_delete(jid: String) -> Result<(), String> {
    keychain::delete(&jid).map_err(|error| error.to_string())
}

/// Where the webview connects for XMPP: `ws://127.0.0.1:<port>/xmpp/<token>`.
#[tauri::command]
fn relay_url(relay: tauri::State<relay::Handle>) -> String {
    relay.url().to_owned()
}

#[tauri::command]
fn set_unread_count(app: AppHandle, count: u32) -> Result<(), String> {
    tray::set_unread(&app, count).map_err(|error| error.to_string())
}

/// On macOS and Windows the close button hides the window: the app stays in the tray, "Quit"
/// (tray menu or Cmd+Q) exits. On Linux, where trays are not a given, closing quits.
const CLOSE_HIDES: bool = cfg!(any(target_os = "macos", windows));

pub fn run() {
    let smoke = std::env::args().any(|argument| argument == "--smoke");
    keychain::install_platform_store();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            keychain_get,
            keychain_set,
            keychain_delete,
            relay_url,
            set_unread_count
        ])
        .on_window_event(|window, event| {
            if !CLOSE_HIDES {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Err(error) = window.hide() {
                    eprintln!("window: cannot hide: {error}");
                }
            }
        })
        .setup(move |app| {
            app.manage(relay::start()?);
            tray::install(app.handle())?;
            links::arm(app.handle());
            if smoke {
                smoke::arm(app.handle().clone());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Hey Postie");

    app.run(|_app, _event| {
        // A click on the dock icon while the window is hidden brings it back.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } = _event
        {
            if let Err(error) = window::show_main(_app) {
                eprintln!("window: cannot show: {error}");
            }
        }
    });
}
