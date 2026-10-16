//! One HTTP/1.1 POST on the loopback interface, written by hand: the endpoint is ours, answers
//! with `Content-Length` (hyper, `src-tauri/src/mcp/server.rs`), and a client crate would be the
//! largest part of this binary.

use crate::endpoint::Endpoint;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

/// The app answers within 30 s or gives up with a 503; a little more here.
const TIMEOUT: Duration = Duration::from_secs(40);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, PartialEq, Eq)]
pub struct Response {
    pub status: u16,
    pub content_type: String,
    pub body: String,
}

/// Where it failed: before the request left (nothing happened) or after (it may have happened).
#[derive(Debug, PartialEq, Eq)]
pub enum Failure {
    Unreachable,
    NoAnswer,
}

pub fn post(
    endpoint: &Endpoint,
    headers: &[(&str, String)],
    body: &str,
) -> Result<Response, Failure> {
    let address = (endpoint.host.as_str(), endpoint.port)
        .to_socket_addrs()
        .map_err(|_| Failure::Unreachable)?
        .next()
        .ok_or(Failure::Unreachable)?;
    let mut stream =
        TcpStream::connect_timeout(&address, CONNECT_TIMEOUT).map_err(|_| Failure::Unreachable)?;
    stream
        .set_read_timeout(Some(TIMEOUT))
        .map_err(|_| Failure::Unreachable)?;
    stream
        .set_write_timeout(Some(TIMEOUT))
        .map_err(|_| Failure::Unreachable)?;
    let mut request = format!(
        "POST {} HTTP/1.1\r\nHost: {}:{}\r\nAuthorization: Bearer {}\r\nContent-Length: {}\r\nConnection: close\r\n",
        endpoint.path,
        endpoint.host,
        endpoint.port,
        endpoint.token,
        body.len()
    );
    for (name, value) in headers {
        request.push_str(&format!("{name}: {value}\r\n"));
    }
    request.push_str("\r\n");
    request.push_str(body);
    stream
        .write_all(request.as_bytes())
        .map_err(|_| Failure::NoAnswer)?;
    let mut raw = Vec::new();
    stream
        .read_to_end(&mut raw)
        .map_err(|_| Failure::NoAnswer)?;
    parse_response(&raw).ok_or(Failure::NoAnswer)
}

/// Status, content type and body of a complete response; chunked bodies are joined.
pub fn parse_response(raw: &[u8]) -> Option<Response> {
    let split = raw.windows(4).position(|window| window == b"\r\n\r\n")?;
    let head = std::str::from_utf8(&raw[..split]).ok()?;
    let body = &raw[split + 4..];
    let mut lines = head.split("\r\n");
    let status = lines.next()?.split(' ').nth(1)?.parse().ok()?;
    let mut content_type = String::new();
    let mut chunked = false;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        match name.trim().to_ascii_lowercase().as_str() {
            "content-type" => content_type = value.to_string(),
            "transfer-encoding" => chunked = value.eq_ignore_ascii_case("chunked"),
            _ => {}
        }
    }
    let body = if chunked {
        unchunk(body)?
    } else {
        body.to_vec()
    };
    Some(Response {
        status,
        content_type,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
}

fn unchunk(mut rest: &[u8]) -> Option<Vec<u8>> {
    let mut body = Vec::new();
    loop {
        let end = rest.windows(2).position(|window| window == b"\r\n")?;
        let size = std::str::from_utf8(&rest[..end]).ok()?;
        let size = usize::from_str_radix(size.split(';').next()?.trim(), 16).ok()?;
        if size == 0 {
            return Some(body);
        }
        let data = rest.get(end + 2..end + 2 + size)?;
        body.extend_from_slice(data);
        rest = rest.get(end + 2 + size..)?.strip_prefix(b"\r\n")?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_plain_response() {
        let raw =
            b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 2\r\n\r\n{}";
        assert_eq!(
            parse_response(raw),
            Some(Response {
                status: 200,
                content_type: "application/json".into(),
                body: "{}".into()
            })
        );
    }

    #[test]
    fn joins_a_chunked_body() {
        let raw = b"HTTP/1.1 401 Unauthorized\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n";
        let response = parse_response(raw).unwrap();
        assert_eq!((response.status, response.body.as_str()), (401, "abcde"));
    }

    #[test]
    fn refuses_a_cut_response() {
        assert_eq!(parse_response(b"HTTP/1.1 200 OK\r\ncontent-type: a"), None);
        assert_eq!(parse_response(b""), None);
    }
}
