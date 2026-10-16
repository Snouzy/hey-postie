//! Accepts HTTP/1.1 connections, checks each request (`guard`), hands it to the webview and
//! answers with the webview's reply.

use super::guard::{self, Incoming, Rejection};
use super::{lock, Forwarded, McpState, Pending, Reply};
use http_body_util::{BodyExt, Full, Limited};
use hyper::body::{Bytes, Incoming as Body};
use hyper::{header, Request, Response};
use hyper_util::rt::TokioIo;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::oneshot;

/// Longer than the two minutes a send waits for the user's approval, so the approval decides.
const REPLY_TIMEOUT: Duration = Duration::from_secs(150);

/// The headers the MCP server needs (spec 2026-07-28 checks the last three against the body).
const FORWARDED_HEADERS: [&str; 5] = [
    "content-type",
    "accept",
    "mcp-protocol-version",
    "mcp-method",
    "mcp-name",
];

#[derive(Clone)]
pub struct Context {
    pub app: tauri::AppHandle,
    pub port: u16,
    pub token: String,
    pub pending: Pending,
    pub next_id: Arc<AtomicU64>,
}

pub async fn serve(
    listener: std::net::TcpListener,
    context: Context,
    mut stopped: oneshot::Receiver<()>,
) {
    let listener = match tokio::net::TcpListener::from_std(listener) {
        Ok(listener) => listener,
        Err(error) => {
            log::warn!("mcp: cannot serve: {}", error.kind());
            return;
        }
    };
    loop {
        let stream = tokio::select! {
            _ = &mut stopped => return,
            accepted = listener.accept() => match accepted {
                Ok((stream, _)) => stream,
                Err(error) => {
                    log::warn!("mcp: accept failed: {}", error.kind());
                    continue;
                }
            },
        };
        let context = context.clone();
        tauri::async_runtime::spawn(async move {
            let service =
                hyper::service::service_fn(move |request| handle(request, context.clone()));
            if let Err(error) = hyper::server::conn::http1::Builder::new()
                .serve_connection(TokioIo::new(stream), service)
                .await
            {
                log::debug!("mcp: connection ended: {error}");
            }
        });
    }
}

async fn handle(
    request: Request<Body>,
    context: Context,
) -> Result<Response<Full<Bytes>>, std::convert::Infallible> {
    let text = |name: header::HeaderName| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
    };
    let incoming = Incoming {
        method: request.method().as_str(),
        path: request.uri().path(),
        host: text(header::HOST),
        origin: text(header::ORIGIN),
        authorization: text(header::AUTHORIZATION),
        content_length: text(header::CONTENT_LENGTH).and_then(|value| value.parse().ok()),
    };
    if let Err(rejection) = guard::check(&incoming, context.port, &context.token) {
        log::info!("mcp: refused with {}", rejection.status);
        return Ok(error_response(&rejection));
    }
    let headers: Vec<(String, String)> = FORWARDED_HEADERS
        .iter()
        .filter_map(|name| {
            let value = request.headers().get(*name)?.to_str().ok()?;
            Some(((*name).to_string(), value.to_string()))
        })
        .collect();
    let method = headers
        .iter()
        .find(|(name, _)| name == "mcp-method")
        .map(|(_, value)| value.clone());
    let body = match Limited::new(request.into_body(), guard::MAX_BODY_BYTES as usize)
        .collect()
        .await
    {
        Ok(collected) => String::from_utf8_lossy(&collected.to_bytes()).into_owned(),
        Err(_) => {
            return Ok(error_response(&Rejection {
                status: 400,
                message: "Unreadable body.",
            }))
        }
    };
    let reply = forward(&context, headers, body).await;
    log::info!(
        "mcp: {} -> {}",
        method.as_deref().unwrap_or("?"),
        reply.status
    );
    Ok(Response::builder()
        .status(reply.status)
        .header(header::CONTENT_TYPE, reply.content_type)
        .body(Full::new(Bytes::from(reply.body)))
        .unwrap_or_else(|_| {
            error_response(&Rejection {
                status: 500,
                message: "Bad reply.",
            })
        }))
}

/// Hands the request to the webview and waits for its reply.
async fn forward(context: &Context, headers: Vec<(String, String)>, body: String) -> Reply {
    let id = McpState::next(&context.next_id);
    let (reply, replied) = oneshot::channel();
    lock(&context.pending).insert(id, reply);
    if context
        .app
        .emit("mcp-request", Forwarded { id, headers, body })
        .is_err()
    {
        lock(&context.pending).remove(&id);
        return unavailable();
    }
    match tokio::time::timeout(REPLY_TIMEOUT, replied).await {
        Ok(Ok(reply)) => reply,
        _ => {
            lock(&context.pending).remove(&id);
            unavailable()
        }
    }
}

fn unavailable() -> Reply {
    let rejection = Rejection {
        status: 503,
        message: "Hey Postie did not answer: check that the app is open and signed in.",
    };
    Reply {
        status: rejection.status,
        content_type: "application/json".into(),
        body: json_error(&rejection),
    }
}

fn error_response(rejection: &Rejection) -> Response<Full<Bytes>> {
    Response::builder()
        .status(rejection.status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Full::new(Bytes::from(json_error(rejection))))
        .unwrap_or_default()
}

/// A JSON-RPC error body, the shape MCP clients read.
fn json_error(rejection: &Rejection) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "error": { "code": -32000, "message": rejection.message },
        "id": null,
    })
    .to_string()
}
