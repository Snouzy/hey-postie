//! Translation between RFC 7395 framing (WebSocket: `<open/>`, `<close/>`, one stanza per frame)
//! and RFC 6120 streams (TCP: one long `<stream:stream>` document).
//!
//! The TCP side needs a splitter (`framing/splitter.rs`) that cuts the byte stream into top-level
//! elements; the element bytes are forwarded untouched, so the client sees exactly what the
//! server sent. `quick-xml` is used where attributes matter: the stream header and the
//! client's `<open/>`.

use quick_xml::escape::escape;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};

mod splitter;
pub use splitter::{Item, Splitter};

pub const FRAMING_NS: &str = "urn:ietf:params:xml:ns:xmpp-framing";
pub const STREAMS_NS: &str = "http://etherx.jabber.org/streams";
pub const STREAM_CLOSE: &[u8] = b"</stream:stream>";

#[derive(Debug, PartialEq, Eq)]
pub enum FramingError {
    /// The first frame of a session must be `<open/>`, and it must carry `to`.
    NotAnOpenFrame,
    /// Something at the top level of the stream that is not XML we know how to forward.
    Malformed(&'static str),
    TooLarge,
}

impl std::fmt::Display for FramingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FramingError::NotAnOpenFrame => write!(f, "the first frame is not <open/>"),
            FramingError::Malformed(what) => write!(f, "malformed stream: {what}"),
            FramingError::TooLarge => {
                write!(f, "element over {} bytes", splitter::MAX_ELEMENT_BYTES)
            }
        }
    }
}

// --- WebSocket -> TCP -------------------------------------------------------------------------

/// What a client frame means for the TCP side.
#[derive(Debug, PartialEq, Eq)]
pub enum ClientFrame {
    Open,
    Close,
    Stanza,
}

pub fn classify(frame: &str) -> ClientFrame {
    match root_element(frame) {
        Some(root) if is_framing(&root, "open") => ClientFrame::Open,
        Some(root) if is_framing(&root, "close") => ClientFrame::Close,
        _ => ClientFrame::Stanza,
    }
}

/// The `to` domain of an `<open/>` frame, which must be the first frame of a session.
pub fn parse_open(frame: &str) -> Result<String, FramingError> {
    let root = root_element(frame).ok_or(FramingError::NotAnOpenFrame)?;
    if !is_framing(&root, "open") {
        return Err(FramingError::NotAnOpenFrame);
    }
    attribute(&root, "to")
        .filter(|to| !to.is_empty())
        .ok_or(FramingError::NotAnOpenFrame)
}

/// The header that opens (or restarts) a stream towards `domain`.
pub fn stream_header(domain: &str) -> String {
    format!(
        "<?xml version='1.0'?><stream:stream xmlns='jabber:client' xmlns:stream='{STREAMS_NS}' \
         to='{}' version='1.0'>",
        escape(domain)
    )
}

// --- TCP -> WebSocket -------------------------------------------------------------------------

/// The server's `<stream:stream ...>` header as an RFC 7395 `<open/>` frame.
pub fn header_to_open(header: &[u8]) -> Result<String, FramingError> {
    let text = std::str::from_utf8(header).map_err(|_| FramingError::Malformed("header utf-8"))?;
    let root = root_element(text).ok_or(FramingError::Malformed("header"))?;
    let mut open = format!(r#"<open xmlns="{FRAMING_NS}""#);
    for name in ["from", "id", "xml:lang"] {
        if let Some(value) = attribute(&root, name) {
            open.push_str(&format!(r#" {name}="{}""#, escape(value.as_str())));
        }
    }
    open.push_str(r#" version="1.0"/>"#);
    Ok(open)
}

/// One top-level element as a stand-alone frame. Elements in the `stream:` prefix inherit that
/// prefix from the header, which the client never sees: re-declare it so the frame parses alone.
pub fn element_to_frame(element: &[u8]) -> Vec<u8> {
    const PREFIX: &[u8] = b"<stream:";
    if !element.starts_with(PREFIX) {
        return element.to_vec();
    }
    let start_tag_end = element
        .iter()
        .position(|byte| *byte == b'>')
        .unwrap_or(element.len());
    if contains(&element[..start_tag_end], b"xmlns:stream=") {
        return element.to_vec();
    }
    let name_end = element
        .iter()
        .position(|byte| byte.is_ascii_whitespace() || *byte == b'/' || *byte == b'>')
        .unwrap_or(element.len());
    let mut frame = Vec::with_capacity(element.len() + 48);
    frame.extend_from_slice(&element[..name_end]);
    frame.extend_from_slice(format!(r#" xmlns:stream="{STREAMS_NS}""#).as_bytes());
    frame.extend_from_slice(&element[name_end..]);
    frame
}

// --- helpers ----------------------------------------------------------------------------------

pub fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

/// The first element of a small document (a frame or a header), as an owned start tag.
fn root_element(xml: &str) -> Option<BytesStart<'static>> {
    let mut reader = Reader::from_str(xml);
    loop {
        match reader.read_event() {
            Ok(Event::Start(start)) | Ok(Event::Empty(start)) => return Some(start.into_owned()),
            Ok(Event::Decl(_)) | Ok(Event::Text(_)) | Ok(Event::Comment(_)) => continue,
            _ => return None,
        }
    }
}

fn is_framing(root: &BytesStart<'_>, local_name: &str) -> bool {
    root.local_name().as_ref() == local_name
        && attribute(root, "xmlns").as_deref() == Some(FRAMING_NS)
}

fn attribute(root: &BytesStart<'_>, name: &str) -> Option<String> {
    root.attributes()
        .flatten()
        .find(|attribute| attribute.key.as_ref() == name)
        .and_then(|attribute| attribute.normalized_value(XmlVersion::Implicit1_0).ok())
        .map(|value| value.into_owned())
}

#[cfg(test)]
mod tests;
