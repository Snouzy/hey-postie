//! The local MCP endpoint (spec 2026-10-16-mcp-design): `http://127.0.0.1:<port>/mcp`, through
//! which Claude reads chats and acts. Rust only guards and carries: `guard` checks the token, the
//! Host and the Origin, `server` accepts connections, and each accepted request is handed to the
//! webview (event `mcp-request`), which runs the MCP server over the core services and answers
//! with the `mcp_reply` command. The webview starts and stops it (`mcp_start`, `mcp_stop`) when the
//! user's settings change; it is off by default. Logs: method and status, never a body or a token.

mod guard;
mod server;

use std::collections::HashMap;
use std::net::TcpListener;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

/// The webview's answer to one forwarded request.
#[derive(Debug, serde::Deserialize)]
pub struct Reply {
    pub status: u16,
    pub content_type: String,
    pub body: String,
}

/// One forwarded request, as the webview receives it.
#[derive(Clone, serde::Serialize)]
pub struct Forwarded {
    pub id: u64,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

/// Requests waiting for the webview's reply, by id.
type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Reply>>>>;

/// The listener while it runs, and the replies it waits for.
#[derive(Default)]
pub struct McpState {
    running: Mutex<Option<oneshot::Sender<()>>>,
    pending: Pending,
    next_id: Arc<AtomicU64>,
}

/// Starts the listener on `127.0.0.1:<port>` with this token, replacing a running one.
#[tauri::command]
pub fn mcp_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, McpState>,
    port: u16,
    token: String,
) -> Result<(), String> {
    stop(&state);
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|error| {
        log::warn!("mcp: cannot listen on port {port}: {}", error.kind());
        "PortUnavailable".to_string()
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "PortUnavailable".to_string())?;
    let (shutdown, stopped) = oneshot::channel();
    let context = server::Context {
        app,
        port,
        token,
        pending: Arc::clone(&state.pending),
        next_id: Arc::clone(&state.next_id),
    };
    tauri::async_runtime::spawn(server::serve(listener, context, stopped));
    *lock(&state.running) = Some(shutdown);
    log::info!("mcp: listening on 127.0.0.1:{port}");
    Ok(())
}

#[tauri::command]
pub fn mcp_stop(state: tauri::State<'_, McpState>) {
    stop(&state);
}

/// The webview's answer to the request `id`; an unknown id (timed out) is ignored.
#[tauri::command]
pub fn mcp_reply(state: tauri::State<'_, McpState>, id: u64, reply: Reply) {
    if let Some(waiting) = lock(&state.pending).remove(&id) {
        let _ = waiting.send(reply);
    }
}

fn stop(state: &McpState) {
    if let Some(shutdown) = lock(&state.running).take() {
        let _ = shutdown.send(());
        log::info!("mcp: stopped");
    }
}

/// A poisoned lock only means another thread panicked while holding it; the data is still usable.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl McpState {
    fn next(next_id: &AtomicU64) -> u64 {
        next_id.fetch_add(1, Ordering::Relaxed)
    }
}
