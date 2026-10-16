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

/// The token the guard checks, shared with the running listener so a new one applies at once.
pub type Token = Arc<Mutex<String>>;

/// A listener that runs: its port, its token, and how to stop it.
struct Running {
    port: u16,
    token: Token,
    shutdown: oneshot::Sender<()>,
}

/// The listener while it runs, and the replies it waits for.
#[derive(Default)]
pub struct McpState {
    running: Mutex<Option<Running>>,
    pending: Pending,
    next_id: Arc<AtomicU64>,
}

/// A port just let go may still be held for a moment by the listener that is closing.
const BIND_ATTEMPTS: u32 = 20;
const BIND_RETRY: std::time::Duration = std::time::Duration::from_millis(50);

/// Listens on `127.0.0.1:<port>` with this token. On the port already served, only the token
/// changes (no rebind, so no race with the closing socket); on another port, the old listener
/// stops and the new one binds.
#[tauri::command]
pub fn mcp_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, McpState>,
    port: u16,
    token: String,
) -> Result<(), String> {
    let mut running = lock(&state.running);
    if let Some(current) = running.as_ref().filter(|current| current.port == port) {
        *lock(&current.token) = token;
        return Ok(());
    }
    if let Some(previous) = running.take() {
        let _ = previous.shutdown.send(());
    }
    let listener = bind(port)?;
    let (shutdown, stopped) = oneshot::channel();
    let token: Token = Arc::new(Mutex::new(token));
    let context = server::Context {
        app,
        port,
        token: Arc::clone(&token),
        pending: Arc::clone(&state.pending),
        next_id: Arc::clone(&state.next_id),
    };
    tauri::async_runtime::spawn(server::serve(listener, context, stopped));
    *running = Some(Running {
        port,
        token,
        shutdown,
    });
    log::info!("mcp: listening on 127.0.0.1:{port}");
    Ok(())
}

fn bind(port: u16) -> Result<TcpListener, String> {
    let mut attempt = 1;
    loop {
        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(listener) => {
                listener
                    .set_nonblocking(true)
                    .map_err(|_| "PortUnavailable".to_string())?;
                return Ok(listener);
            }
            Err(error) if attempt >= BIND_ATTEMPTS => {
                log::warn!("mcp: cannot listen on port {port}: {}", error.kind());
                return Err("PortUnavailable".to_string());
            }
            Err(_) => {
                attempt += 1;
                std::thread::sleep(BIND_RETRY);
            }
        }
    }
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
    if let Some(running) = lock(&state.running).take() {
        let _ = running.shutdown.send(());
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
