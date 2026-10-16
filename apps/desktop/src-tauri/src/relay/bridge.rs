//! One session: a WebSocket from the webview on one side, a TLS stream to the XMPP server on the
//! other. This file is the setup (read `<open/>`, resolve, connect); `pump` moves the frames.

use std::time::Duration;

use futures_util::StreamExt;
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;
use tokio_tungstenite::tungstenite::Message;

use super::framing::{self, OpenFrame};
use super::{connect, pump, resolve, tls, RelayError, Ws};

/// How long the client has to send its `<open/>` after the WebSocket handshake.
const OPEN_TIMEOUT: Duration = Duration::from_secs(10);

/// Runs the session to its end and closes the WebSocket, with the reason if there is one.
pub async fn run(mut ws: Ws) {
    match setup(&mut ws).await {
        Ok((open, server)) => pump::run(ws, server, &open).await,
        Err(error) => pump::close(ws, Err(error)).await,
    }
}

/// Everything before the first byte is relayed: the `<open/>` frame, DNS, TCP, TLS.
async fn setup(ws: &mut Ws) -> Result<(OpenFrame, TlsStream<TcpStream>), RelayError> {
    let first = tokio::time::timeout(OPEN_TIMEOUT, next_text_frame(ws))
        .await
        .map_err(|_| RelayError::StreamError("no <open/> within the timeout".into()))?
        .ok_or(RelayError::StreamError("closed before <open/>".into()))?;
    let open = framing::parse_open(&first).map_err(pump::stream_error)?;
    log::debug!("session opens for a domain of {} characters", open.to.len());
    // What TLS cannot verify is not worth a DNS lookup or a connection.
    tls::server_name(&open.to)?;

    let candidates = resolve::candidates(&open.to).await?;
    // Connecting can take several timeouts in a row; keep reading the WebSocket meanwhile so
    // that a webview that gave up (or reloaded) does not leave attempts running for nothing.
    let server = tokio::select! {
        connected = connect::connect_any(&candidates, &open.to) => connected?,
        gone = watch_client(ws) => return Err(gone),
    };
    Ok((open, server))
}

/// The next text frame; `None` when the client is gone. Control frames are skipped.
async fn next_text_frame(ws: &mut Ws) -> Option<String> {
    loop {
        match ws.next().await? {
            Ok(Message::Text(text)) => return Some(text.to_string()),
            Ok(Message::Binary(bytes)) => return String::from_utf8(bytes.to_vec()).ok(),
            Ok(Message::Close(_)) | Err(_) => return None,
            Ok(_) => {}
        }
    }
}

/// Resolves when the client leaves or sends data while the stream is not open yet. Polling the
/// WebSocket here is also what lets tungstenite answer the client's pings.
async fn watch_client(ws: &mut Ws) -> RelayError {
    loop {
        match ws.next().await {
            Some(Ok(Message::Text(_))) | Some(Ok(Message::Binary(_))) => {
                return RelayError::StreamError("frame before the stream opened".into());
            }
            Some(Ok(Message::Close(_))) | Some(Err(_)) | None => {
                return RelayError::StreamError("client left while connecting".into());
            }
            Some(Ok(_)) => {}
        }
    }
}
