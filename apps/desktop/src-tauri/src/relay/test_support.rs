//! A scripted TCP server standing in for an XMPP server in tests: for each step it waits until
//! the bytes received so far contain `expect`, then writes every chunk of `reply`, pausing
//! between chunks so that an element really arrives split across reads.

use std::net::SocketAddr;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub const STREAMS_NS: &str = "http://etherx.jabber.org/streams";
pub const SASL_NS: &str = "urn:ietf:params:xml:ns:xmpp-sasl";
pub const TLS_NS: &str = "urn:ietf:params:xml:ns:xmpp-tls";

pub type Step = (&'static str, Vec<String>);

/// The header a server sends back, with the given stream id.
pub fn server_header(id: &str) -> String {
    format!(
        "<?xml version='1.0'?><stream:stream xmlns='jabber:client' xmlns:stream='{STREAMS_NS}' \
         id='{id}' from='example.org' version='1.0'>"
    )
}

/// Starts the server for one connection and returns its address. After the last step it keeps
/// reading until the peer closes, so that the relay never sees an early end of stream.
pub async fn fake_server(steps: Vec<Step>) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut received = Vec::new();
        let mut chunk = [0u8; 4096];
        for (expect, reply) in steps {
            while !contains(&received, expect.as_bytes()) {
                let count = stream.read(&mut chunk).await.unwrap();
                assert!(count > 0, "peer closed while waiting for {expect}");
                received.extend_from_slice(&chunk[..count]);
            }
            received.clear();
            for part in reply {
                stream.write_all(part.as_bytes()).await.unwrap();
                stream.flush().await.unwrap();
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        }
        while matches!(stream.read(&mut chunk).await, Ok(count) if count > 0) {}
    });
    address
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}
