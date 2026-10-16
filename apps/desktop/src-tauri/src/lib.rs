//! The Rust side of Hey Postie: plugins, commands, tray, links, save panel, and the `--smoke`
//! self-check.

mod i18n;
mod keychain;
mod links;
#[cfg(target_os = "macos")]
mod notification_identity;
mod relay;
mod save;
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

/// The credentials of the `--smoke` sign-in, when the run asks for one (see `smoke.rs`).
#[tauri::command]
fn smoke_login(login: tauri::State<smoke::Login>) -> Option<(String, String)> {
    login.0.clone()
}

#[tauri::command]
fn set_unread_count(
    app: AppHandle,
    language: tauri::State<i18n::Language>,
    count: u32,
) -> Result<(), String> {
    tray::set_unread(&app, *language, count).map_err(|error| error.to_string())
}

/// Shows the save panel for the bytes in the request body and writes the file (see `save.rs`).
#[tauri::command]
async fn save_file(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    save::save(&app, request)
        .await
        .map_err(|error| error.to_string())
}

/// On macOS and Windows the close button hides the window: the app stays in the tray, "Quit"
/// (tray menu or Cmd+Q) exits. On Linux, where trays are not a given, closing quits.
const CLOSE_HIDES: bool = cfg!(any(target_os = "macos", windows));

pub fn run() {
    let smoke = std::env::args().any(|argument| argument == "--smoke");
    let login = smoke::login_from_env(smoke);
    let with_login = login.0.is_some();
    let driven = smoke::driven_from_env(&login);
    keychain::install_platform_store();

    let app = tauri::Builder::default()
        // First, so that a second instance (an `xmpp:` link on Windows or Linux) hands its
        // arguments to this one and exits before anything else starts.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Err(error) = window::show_main(app) {
                eprintln!("single-instance: cannot show the window: {error}");
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        // The webview checks for updates (`app/updater.ts`) and relaunches after an install.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            keychain_get,
            keychain_set,
            keychain_delete,
            relay_url,
            smoke_login,
            set_unread_count,
            save_file
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
        .manage(login)
        .manage(i18n::system_language())
        .manage(window::Smoke(smoke))
        .setup(move |app| {
            // A `--smoke` run is driven by a script while someone may be working: no dock icon,
            // no activation, the window never takes the focus (see `window.rs`).
            #[cfg(target_os = "macos")]
            if smoke {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            #[cfg(target_os = "macos")]
            notification_identity::claim(&app.config().identifier);
            app.manage(relay::start()?);
            tray::install(app.handle(), *app.state::<i18n::Language>())?;
            links::arm(app.handle());
            if smoke {
                smoke::arm(app.handle().clone(), with_login, driven);
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
