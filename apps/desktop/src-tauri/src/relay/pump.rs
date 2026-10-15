//! Moves frames between an open WebSocket and a connected server stream, both ways at once.
//!
//! The two directions are two independent futures polled together: a write that waits for one
//! peer never stops the reads from the other, so a burst on both sides cannot deadlock. The
//! first direction to finish ends the session; the other is simply dropped.

use std::sync::atomic::{AtomicBool, Ordering};

use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadHalf, WriteHalf};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;

use super::framing::{self, ClientFrame, FramingError, Item, OpenFrame, Splitter};
use super::{RelayError, Ws};

/// Relays until one side ends, then closes the WebSocket with the outcome.
pub async fn run<S>(ws: Ws, server: S, open: &OpenFrame)
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let (mut sink, mut stream) = ws.split();
    let (mut reader, mut writer) = tokio::io::split(server);
    // Set once `<success/>` went by: only then may the client restart the stream.
    let authenticated = AtomicBool::new(false);

    // The client's first `<open/>` was consumed during setup; its header goes out now.
    let outcome = match send(&mut writer, framing::stream_header(open).as_bytes()).await {
        Err(error) => Err(error),
        Ok(()) => tokio::select! {
            up = client_to_server(&mut stream, &mut writer, &authenticated) => up,
            down = server_to_client(&mut reader, &mut sink, &authenticated) => down,
        },
    };
    // Both halves come from this split, so reuniting cannot fail; if it ever did, the
    // connection is dropped, which closes it too.
    if let Ok(ws) = sink.reunite(stream) {
        close(ws, outcome).await;
    }
}

/// Closes the WebSocket: cleanly, or with the error's name as the reason.
pub async fn close(mut ws: Ws, outcome: Result<(), RelayError>) {
    let frame = match outcome {
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
    let _ = ws.close(frame).await;
}

async fn client_to_server<W: AsyncWrite + Unpin>(
    stream: &mut SplitStream<Ws>,
    writer: &mut WriteHalf<W>,
    authenticated: &AtomicBool,
) -> Result<(), RelayError> {
    while let Some(frame) = stream.next().await {
        let text = match frame {
            Ok(Message::Text(text)) => text.to_string(),
            Ok(Message::Binary(bytes)) => String::from_utf8(bytes.to_vec())
                .map_err(|_| RelayError::StreamError("frame is not utf-8".into()))?,
            Ok(Message::Close(_)) | Err(_) => break,
            // tungstenite answers pings by itself.
            Ok(_) => continue,
        };
        match framing::classify(&text).map_err(stream_error)? {
            ClientFrame::Open(restart) => {
                // RFC 6120 section 4.3.3: a restart only follows a successful SASL exchange.
                if !authenticated.load(Ordering::Relaxed) {
                    return Err(RelayError::StreamError(
                        "stream restart before authentication".into(),
                    ));
                }
                log::debug!("client restarts the stream");
                send(writer, framing::stream_header(&restart).as_bytes()).await?;
            }
            ClientFrame::Close => {
                log::debug!("client closes the stream");
                send(writer, framing::STREAM_CLOSE).await?;
                let _ = writer.shutdown().await;
                return Ok(());
            }
            ClientFrame::Stanza => {
                log::debug!("client -> server: {} bytes", text.len());
                send(writer, text.as_bytes()).await?;
            }
        }
    }
    log::debug!("client left, closing the stream");
    let _ = writer.write_all(framing::STREAM_CLOSE).await;
    let _ = writer.shutdown().await;
    Ok(())
}

async fn server_to_client<R: AsyncRead + Unpin>(
    reader: &mut ReadHalf<R>,
    sink: &mut SplitSink<Ws, Message>,
    authenticated: &AtomicBool,
) -> Result<(), RelayError> {
    let mut splitter = Splitter::new();
    let mut chunk = vec![0u8; 16 * 1024];
    loop {
        let count = reader
            .read(&mut chunk)
            .await
            .map_err(|error| RelayError::ServerUnreachable(error.kind().to_string()))?;
        if count == 0 {
            return Err(RelayError::ServerUnreachable("connection closed".into()));
        }
        for item in splitter.push(&chunk[..count]).map_err(stream_error)? {
            let frame = match item {
                Item::Header(header) => {
                    log::debug!("server opens the stream");
                    framing::header_to_open(&header).map_err(stream_error)?
                }
                Item::Element(element) => {
                    let name = framing::root_name(&element).to_vec();
                    log::debug!("server -> client: {} bytes", element.len());
                    if name == b"success" {
                        authenticated.store(true, Ordering::Relaxed);
                    }
                    let frame = String::from_utf8(framing::element_to_frame(&element))
                        .map_err(|_| RelayError::StreamError("element is not utf-8".into()))?;
                    send_frame(sink, frame).await?;
                    if name == b"stream:error" {
                        // The server will close the TCP side; the client learns the cause now.
                        return Err(RelayError::StreamError(
                            "stream error from the server".into(),
                        ));
                    }
                    continue;
                }
                Item::Close => {
                    log::debug!("server closes the stream");
                    let close = format!(r#"<close xmlns="{}"/>"#, framing::FRAMING_NS);
                    let _ = send_frame(sink, close).await;
                    return Ok(());
                }
            };
            send_frame(sink, frame).await?;
        }
    }
}

pub async fn send<W: AsyncWrite + Unpin>(writer: &mut W, bytes: &[u8]) -> Result<(), RelayError> {
    writer
        .write_all(bytes)
        .await
        .and(writer.flush().await)
        .map_err(|error| RelayError::ServerUnreachable(error.kind().to_string()))
}

async fn send_frame(sink: &mut SplitSink<Ws, Message>, frame: String) -> Result<(), RelayError> {
    sink.send(Message::Text(frame.into()))
        .await
        .map_err(|_| RelayError::StreamError("client went away".into()))
}

pub fn stream_error(error: FramingError) -> RelayError {
    RelayError::StreamError(error.to_string())
}

#[cfg(test)]
mod tests;
