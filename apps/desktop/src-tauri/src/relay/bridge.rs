//! One session: a WebSocket from the webview on one side, a TLS stream to the XMPP server on the
//! other. Connecting (DNS, TCP, STARTTLS) happens here too, because it needs the `<open/>` frame.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt, WriteHalf};
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;

use super::framing::{self, contains, ClientFrame, FramingError, Item, Splitter};
use super::resolve::{self, Candidate, Security};
use super::{tls, RelayError};

/// Per attempt: DNS is done, this covers TCP, STARTTLS and the TLS handshake of one candidate.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// How long the client has to send its `<open/>` after the WebSocket handshake.
const OPEN_TIMEOUT: Duration = Duration::from_secs(10);

type Ws = WebSocketStream<TcpStream>;

/// Runs the session to its end, then closes the WebSocket with the reason if there is one.
pub async fn run(mut ws: Ws) {
    let outcome = session(&mut ws).await;
    let close = match &outcome {
        Ok(()) => None,
        Err(error) => {
            log::debug!("session ended: {error:?}");
            Some(CloseFrame {
                code: CloseCode::Error,
                reason: error.to_string().into(),
            })
        }
    };
    // The peer may already be gone; nothing left to do about it.
    let _ = ws.close(close).await;
}

async fn session(ws: &mut Ws) -> Result<(), RelayError> {
    let first = tokio::time::timeout(OPEN_TIMEOUT, next_text_frame(ws))
        .await
        .map_err(|_| RelayError::StreamError("no <open/> within the timeout".into()))?
        .ok_or(RelayError::StreamError("closed before <open/>".into()))?;
    let domain = framing::parse_open(&first).map_err(stream_error)?;
    log::debug!("session opens for a domain of {} characters", domain.len());

    let server = connect_any(&resolve::candidates(&domain).await, &domain).await?;
    let (mut reader, mut writer) = tokio::io::split(server);
    // The client's `<open/>` was consumed above; its stream header goes out now.
    send(&mut writer, framing::stream_header(&domain).as_bytes()).await?;

    let mut splitter = Splitter::new();
    let mut chunk = vec![0u8; 16 * 1024];
    loop {
        tokio::select! {
            frame = ws.next() => match frame {
                Some(Ok(Message::Text(text))) => {
                    if !forward_client_frame(&mut writer, &mut splitter, &domain, &text).await? {
                        return Ok(());
                    }
                }
                Some(Ok(Message::Binary(bytes))) => {
                    let text = std::str::from_utf8(&bytes)
                        .map_err(|_| RelayError::StreamError("frame is not utf-8".into()))?;
                    if !forward_client_frame(&mut writer, &mut splitter, &domain, text).await? {
                        return Ok(());
                    }
                }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => {
                    log::debug!("client left, closing the stream");
                    let _ = writer.write_all(framing::STREAM_CLOSE).await;
                    let _ = writer.shutdown().await;
                    return Ok(());
                }
                // tungstenite answers pings by itself.
                Some(Ok(_)) => {}
            },
            read = reader.read(&mut chunk) => match read {
                Ok(0) => return Err(RelayError::ServerUnreachable("connection closed".into())),
                Ok(count) => {
                    for item in splitter.push(&chunk[..count]).map_err(stream_error)? {
                        if !forward_server_item(ws, item).await? {
                            return Ok(());
                        }
                    }
                }
                Err(error) => return Err(RelayError::ServerUnreachable(error.kind().to_string())),
            },
        }
    }
}

/// Returns `false` when the client closed the stream and the session is over.
async fn forward_client_frame(
    writer: &mut WriteHalf<TlsStream<TcpStream>>,
    splitter: &mut Splitter,
    domain: &str,
    frame: &str,
) -> Result<bool, RelayError> {
    match framing::classify(frame) {
        ClientFrame::Open => {
            // A stream restart (after SASL): a new header on the same TLS connection.
            log::debug!("client restarts the stream");
            splitter.reset();
            send(writer, framing::stream_header(domain).as_bytes()).await?;
        }
        ClientFrame::Close => {
            log::debug!("client closes the stream");
            send(writer, framing::STREAM_CLOSE).await?;
            let _ = writer.shutdown().await;
            return Ok(false);
        }
        ClientFrame::Stanza => {
            log::debug!("client -> server: {} bytes", frame.len());
            send(writer, frame.as_bytes()).await?;
        }
    }
    Ok(true)
}

/// Returns `false` when the server closed the stream and the session is over.
async fn forward_server_item(ws: &mut Ws, item: Item) -> Result<bool, RelayError> {
    let frame = match item {
        Item::Header(header) => {
            log::debug!("server opens the stream");
            framing::header_to_open(&header).map_err(stream_error)?
        }
        Item::Element(element) => {
            log::debug!("server -> client: {} bytes", element.len());
            let frame = framing::element_to_frame(&element);
            String::from_utf8(frame)
                .map_err(|_| RelayError::StreamError("element is not utf-8".into()))?
        }
        Item::Close => {
            log::debug!("server closes the stream");
            let close = format!(r#"<close xmlns="{}"/>"#, framing::FRAMING_NS);
            let _ = ws.send(Message::Text(close.into())).await;
            return Ok(false);
        }
    };
    ws.send(Message::Text(frame.into()))
        .await
        .map_err(|_| RelayError::StreamError("client went away".into()))?;
    Ok(true)
}

// --- connecting -------------------------------------------------------------------------------

/// Tries every candidate in order. A rejected certificate stops the search: silently moving on
/// to a weaker candidate is what a downgrade attack would want.
async fn connect_any(
    candidates: &[Candidate],
    domain: &str,
) -> Result<TlsStream<TcpStream>, RelayError> {
    let mut last = RelayError::ServerUnreachable("no candidate".into());
    for candidate in candidates {
        log::debug!(
            "trying port {} with {:?} (host of {} characters)",
            candidate.port,
            candidate.security,
            candidate.host.len()
        );
        let attempt = tokio::time::timeout(CONNECT_TIMEOUT, connect_one(candidate, domain)).await;
        match attempt {
            Ok(Ok(stream)) => return Ok(stream),
            Ok(Err(RelayError::CertificateInvalid)) => return Err(RelayError::CertificateInvalid),
            Ok(Err(error)) => last = error,
            Err(_) => last = RelayError::ServerUnreachable("timeout".into()),
        }
        log::debug!("candidate failed: {last:?}");
    }
    Err(last)
}

async fn connect_one(
    candidate: &Candidate,
    domain: &str,
) -> Result<TlsStream<TcpStream>, RelayError> {
    let tcp = TcpStream::connect((candidate.host.as_str(), candidate.port))
        .await
        .map_err(|error| RelayError::ServerUnreachable(error.kind().to_string()))?;
    let tcp = match candidate.security {
        Security::DirectTls => tcp,
        Security::StartTls => negotiate_starttls(tcp, domain).await?,
    };
    tls::connect(tcp, domain).await
}

/// RFC 6120 section 5: open a plain stream, require the `starttls` feature, ask, wait for
/// `<proceed/>`. Returns the socket ready for the TLS handshake.
async fn negotiate_starttls(mut tcp: TcpStream, domain: &str) -> Result<TcpStream, RelayError> {
    const TLS_NS: &str = "urn:ietf:params:xml:ns:xmpp-tls";
    send(&mut tcp, framing::stream_header(domain).as_bytes()).await?;
    let mut splitter = Splitter::new();
    let features = next_element(&mut tcp, &mut splitter).await?;
    if !features.starts_with(b"<stream:features") || !contains(&features, TLS_NS.as_bytes()) {
        return Err(RelayError::StreamError("server offers no STARTTLS".into()));
    }
    send(&mut tcp, format!("<starttls xmlns='{TLS_NS}'/>").as_bytes()).await?;
    let answer = next_element(&mut tcp, &mut splitter).await?;
    if !answer.starts_with(b"<proceed") {
        return Err(RelayError::StreamError("STARTTLS refused".into()));
    }
    Ok(tcp)
}

/// The next complete top-level element from a plain socket, skipping the stream header.
async fn next_element(tcp: &mut TcpStream, splitter: &mut Splitter) -> Result<Vec<u8>, RelayError> {
    let mut chunk = vec![0u8; 4096];
    loop {
        let count = tcp
            .read(&mut chunk)
            .await
            .map_err(|error| RelayError::ServerUnreachable(error.kind().to_string()))?;
        if count == 0 {
            return Err(RelayError::ServerUnreachable(
                "closed during STARTTLS".into(),
            ));
        }
        for item in splitter.push(&chunk[..count]).map_err(stream_error)? {
            match item {
                Item::Header(_) => {}
                Item::Element(element) => return Ok(element),
                Item::Close => {
                    return Err(RelayError::StreamError("closed during STARTTLS".into()))
                }
            }
        }
    }
}

// --- helpers ----------------------------------------------------------------------------------

async fn send<W: AsyncWriteExt + Unpin>(writer: &mut W, bytes: &[u8]) -> Result<(), RelayError> {
    writer
        .write_all(bytes)
        .await
        .and(writer.flush().await)
        .map_err(|error| RelayError::ServerUnreachable(error.kind().to_string()))
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

fn stream_error(error: FramingError) -> RelayError {
    RelayError::StreamError(error.to_string())
}
