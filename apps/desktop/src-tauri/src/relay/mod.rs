//! The XMPP relay: a local WebSocket server (RFC 7395 framing, what Strophe.js speaks) in front
//! of plain XMPP-over-TCP streams (RFC 6120, what servers speak). The webview connects to
//! `ws://127.0.0.1:<port>/xmpp/<token>`; the relay resolves, connects and secures the TCP side.
//!
//! One file per concern: `server` accepts WebSockets, `bridge` sets a session up (`resolve`
//! finds the server, `connect` reaches it, `tls` secures the socket), `pump` relays the frames
//! and `framing` translates between the two wire formats.

mod bridge;
mod connect;
mod framing;
mod pump;
mod resolve;
mod server;
#[cfg(test)]
mod test_support;
mod tls;

use std::net::TcpListener;

/// A WebSocket from the webview, accepted on the loopback listener.
type Ws = tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>;

/// What the webview gets: the URL to connect to. The token keeps other local processes out.
pub struct Handle {
    url: String,
}

impl Handle {
    pub fn url(&self) -> &str {
        &self.url
    }
}

/// Why a session ended. The text is the WebSocket close reason: the client logs it and shows the
/// matching message, so it never carries stanza contents or server details.
#[derive(Debug, thiserror::Error)]
pub enum RelayError {
    /// No candidate accepted the connection, or the connection dropped. The detail is for debug
    /// logs only (an error kind, never a payload).
    #[error("ServerUnreachable")]
    ServerUnreachable(String),
    /// The server's certificate does not match the domain or is not trusted by the OS roots.
    #[error("CertificateInvalid")]
    CertificateInvalid,
    /// The stream broke the protocol: bad framing, unexpected element, STARTTLS refused.
    #[error("StreamError")]
    StreamError(String),
}

/// Binds the listener now (so the port is known before the webview asks) and serves it on
/// Tauri's async runtime. Called once, from the app setup.
pub fn start() -> std::io::Result<Handle> {
    install_debug_logger();
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    // tokio's `TcpListener::from_std` requires a non-blocking socket.
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    let token = random_token();
    let url = format!("ws://127.0.0.1:{port}/xmpp/{token}");
    tauri::async_runtime::spawn(server::serve(listener, token));
    log::info!("listening on 127.0.0.1:{port}");
    Ok(Handle { url })
}

/// 32 random bytes, hex encoded. Known only to this process and the webview it hands it to.
fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::fill(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// `RELAY_DEBUG=1` prints the relay's own `log` records to stderr. Only this module's records:
/// the gate exists so that no dependency can ever print stanza contents by accident.
fn install_debug_logger() {
    if std::env::var_os("RELAY_DEBUG").is_none() {
        return;
    }
    struct StderrLogger;
    impl log::Log for StderrLogger {
        fn enabled(&self, metadata: &log::Metadata) -> bool {
            metadata.target().starts_with(module_path!())
        }
        fn log(&self, record: &log::Record) {
            if self.enabled(record.metadata()) {
                eprintln!("relay {}: {}", record.level(), record.args());
            }
        }
        fn flush(&self) {}
    }
    static LOGGER: StderrLogger = StderrLogger;
    // A second call (there is none) would fail because a logger is already set: harmless.
    let _ = log::set_logger(&LOGGER).map(|()| log::set_max_level(log::LevelFilter::Debug));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_token_is_64_hex_characters() {
        let token = random_token();
        assert_eq!(token.len(), 64);
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(token, random_token());
    }

    #[test]
    fn errors_display_as_the_close_reason() {
        assert_eq!(
            RelayError::ServerUnreachable("timeout".into()).to_string(),
            "ServerUnreachable"
        );
        assert_eq!(
            RelayError::CertificateInvalid.to_string(),
            "CertificateInvalid"
        );
        assert_eq!(
            RelayError::StreamError("x".into()).to_string(),
            "StreamError"
        );
    }
}

/// A real stream against a real server. Run with:
/// `XMPP_TEST_DOMAIN=example.org RELAY_DEBUG=1 cargo test relay -- --ignored --nocapture`.
#[cfg(test)]
mod integration_tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "needs the network and XMPP_TEST_DOMAIN"]
    async fn opens_a_stream_and_receives_features() {
        let domain = std::env::var("XMPP_TEST_DOMAIN").expect("XMPP_TEST_DOMAIN");
        install_debug_logger();
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let token = random_token();
        tokio::spawn(server::serve(listener, token.clone()));

        let url = format!("ws://127.0.0.1:{port}/xmpp/{token}");
        let (mut ws, _) = tokio_tungstenite::connect_async(url).await.unwrap();
        let open = format!(
            r#"<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="{domain}" version="1.0"/>"#
        );
        ws.send(Message::Text(open.into())).await.unwrap();

        let first = next_text(&mut ws).await;
        assert!(first.starts_with("<open "), "got {first}");
        assert!(first.contains(r#"xmlns="urn:ietf:params:xml:ns:xmpp-framing""#));
        let second = next_text(&mut ws).await;
        assert!(second.starts_with("<stream:features"), "got {second}");
        assert!(second.contains(r#"xmlns:stream="http://etherx.jabber.org/streams""#));

        ws.send(Message::Text(
            r#"<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>"#.into(),
        ))
        .await
        .unwrap();
    }

    async fn next_text<S>(ws: &mut S) -> String
    where
        S: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    {
        let frame = tokio::time::timeout(std::time::Duration::from_secs(20), ws.next())
            .await
            .expect("a frame within 20 s")
            .expect("an open connection")
            .expect("a frame");
        match frame {
            Message::Text(text) => text.to_string(),
            other => panic!("expected a text frame, got {other:?}"),
        }
    }
}
