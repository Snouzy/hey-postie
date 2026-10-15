//! The Rust side of Hey Postie: plugins, commands, and the `--smoke` self-check.

mod keychain;
mod smoke;

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

pub fn run() {
    let smoke = std::env::args().any(|argument| argument == "--smoke");
    keychain::install_platform_store();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            keychain_get,
            keychain_set,
            keychain_delete
        ])
        .setup(move |app| {
            if smoke {
                smoke::arm(app.handle().clone());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Hey Postie");
}
