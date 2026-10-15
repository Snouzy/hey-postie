//! `xmpp:` links (RFC 5122). The OS hands them to the deep-link plugin; this module keeps the
//! ones with the `xmpp` scheme, brings the window to front and forwards the URL to the webview as
//! the `xmpp-link` event. The webview parses the JID and opens the chat. The URL holds a JID, so
//! it is never logged.

use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_deep_link::DeepLinkExt;

use crate::window;

pub const EVENT: &str = "xmpp-link";
const SCHEME: &str = "xmpp";

pub fn arm<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls().iter().filter(|url| url.scheme() == SCHEME) {
            if let Err(error) = window::show_main(&handle) {
                eprintln!("links: cannot show the window: {error}");
            }
            if let Err(error) = handle.emit(EVENT, url.as_str()) {
                eprintln!("links: cannot forward the link to the webview: {error}");
            }
        }
    });
    // Windows and Linux start a new instance with the link as the only argument; this records it
    // so that the webview can read it at startup (`plugin:deep-link|get_current`).
    app.deep_link().handle_cli_arguments(std::env::args());
}
