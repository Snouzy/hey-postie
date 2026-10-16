//! Reaching the server: every candidate in turn, TCP, STARTTLS when needed, then TLS.

use std::time::Duration;

use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;

use super::framing::{self, root_name, Item, OpenFrame, Splitter};
use super::pump::{send, stream_error};
use super::resolve::{Candidate, Candidates, Security};
use super::{tls, RelayError};

/// Per attempt: DNS is done, this covers TCP, STARTTLS and the TLS handshake of one candidate.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const TLS_NS: &str = "urn:ietf:params:xml:ns:xmpp-tls";

/// Tries every candidate in order. A rejected certificate stops the search: silently moving on
/// to another candidate is what an attacker on the path would want. One exception: when the
/// candidates are guessed (no SRV at all), port 5223 may host anything, so a certificate problem
/// there still leads to 5222. Both are TLS with the same verification, so nothing is weakened.
pub async fn connect_any(
    candidates: &Candidates,
    domain: &str,
) -> Result<TlsStream<TcpStream>, RelayError> {
    let mut last = RelayError::ServerUnreachable("no candidate".into());
    for candidate in &candidates.list {
        log::debug!(
            "trying port {} with {:?} (host of {} characters)",
            candidate.port,
            candidate.security,
            candidate.host.len()
        );
        let attempt = tokio::time::timeout(CONNECT_TIMEOUT, connect_one(candidate, domain)).await;
        match attempt {
            Ok(Ok(stream)) => return Ok(stream),
            Ok(Err(RelayError::CertificateInvalid)) if !candidates.guessed => {
                return Err(RelayError::CertificateInvalid);
            }
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
    let open = OpenFrame {
        to: domain.to_owned(),
        lang: None,
        version: None,
    };
    send(&mut tcp, framing::stream_header(&open).as_bytes()).await?;
    let mut splitter = Splitter::new();
    let features = next_element(&mut tcp, &mut splitter).await?;
    if root_name(&features) != b"stream:features" || !has_child(&features, b"starttls") {
        return Err(RelayError::StreamError("server offers no STARTTLS".into()));
    }
    send(&mut tcp, format!("<starttls xmlns='{TLS_NS}'/>").as_bytes()).await?;
    let answer = next_element(&mut tcp, &mut splitter).await?;
    if root_name(&answer) != b"proceed" {
        return Err(RelayError::StreamError("STARTTLS refused".into()));
    }
    // Section 5.4.3.3: the server must not send anything after `<proceed/>` until TLS is up.
    // Whatever a misbehaving server put in the same read is not XMPP and is dropped with the
    // splitter here.
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
        for item in splitter.push(&chunk[..count]) {
            match item.map_err(stream_error)? {
                Item::Header(_) => {}
                Item::Element(element) => return Ok(element),
                Item::Close => {
                    return Err(RelayError::StreamError("closed during STARTTLS".into()))
                }
            }
        }
    }
}

/// Whether `element` contains a `<name>` child (`<name/>`, `<name>` or `<name attr…>`).
fn has_child(element: &[u8], name: &[u8]) -> bool {
    element.windows(name.len() + 2).any(|window| {
        window[0] == b'<'
            && &window[1..=name.len()] == name
            && matches!(
                window[name.len() + 1],
                b'/' | b'>' | b' ' | b'\t' | b'\n' | b'\r'
            )
    })
}

#[cfg(test)]
mod tests;
