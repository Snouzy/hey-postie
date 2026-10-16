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
pub use splitter::{Item, Splitter, MAX_ELEMENT_BYTES};

pub const FRAMING_NS: &str = "urn:ietf:params:xml:ns:xmpp-framing";
pub const STREAMS_NS: &str = "http://etherx.jabber.org/streams";
pub const CLIENT_NS: &str = "jabber:client";
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

/// What the client asked for in its `<open/>` frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenFrame {
    pub to: String,
    pub lang: Option<String>,
    pub version: Option<String>,
}

/// What a client frame means for the TCP side.
#[derive(Debug, PartialEq, Eq)]
pub enum ClientFrame {
    Open(OpenFrame),
    Close,
    Stanza,
}

/// A frame is one stanza, `<open/>` or `<close/>`; stream-level markup inside a frame would let
/// the client forge a stream restart or close on the TCP side, so it is refused.
pub fn classify(frame: &str) -> Result<ClientFrame, FramingError> {
    if frame.contains("<stream:stream") || frame.contains("</stream:stream") {
        return Err(FramingError::Malformed("stream markup in a frame"));
    }
    let Some(root) = root_element(frame) else {
        return Ok(ClientFrame::Stanza);
    };
    if is_framing(&root, "open") {
        let to = attribute(&root, "to")
            .filter(|to| !to.is_empty())
            .ok_or(FramingError::NotAnOpenFrame)?;
        return Ok(ClientFrame::Open(OpenFrame {
            to,
            lang: attribute(&root, "xml:lang"),
            version: attribute(&root, "version"),
        }));
    }
    if is_framing(&root, "close") {
        return Ok(ClientFrame::Close);
    }
    Ok(ClientFrame::Stanza)
}

/// The first frame of a session must be `<open/>`.
pub fn parse_open(frame: &str) -> Result<OpenFrame, FramingError> {
    match classify(frame)? {
        ClientFrame::Open(open) => Ok(open),
        _ => Err(FramingError::NotAnOpenFrame),
    }
}

/// The header that opens (or restarts) a stream, carrying what the client asked for.
pub fn stream_header(open: &OpenFrame) -> String {
    let mut header = format!(
        "<?xml version='1.0'?><stream:stream xmlns='jabber:client' xmlns:stream='{STREAMS_NS}' \
         to='{}' version='{}'",
        escape(open.to.as_str()),
        escape(open.version.as_deref().unwrap_or("1.0"))
    );
    if let Some(lang) = &open.lang {
        header.push_str(&format!(" xml:lang='{}'", escape(lang.as_str())));
    }
    header.push('>');
    header
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

/// One top-level element as a stand-alone frame (RFC 7395 section 3.3.3). Inside the stream,
/// elements inherit the default `jabber:client` namespace and the `stream:` prefix from the
/// header; the client never sees that header, so whichever of the two the element relies on is
/// declared on it. Elements that declare their own `xmlns` (SASL, stream management) are untouched.
pub fn element_to_frame(element: &[u8]) -> Vec<u8> {
    let name = root_name(element);
    if name.is_empty() || !element.starts_with(b"<") {
        // Not a tag (the splitter never produces this); nothing to declare on it.
        return element.to_vec();
    }
    let start_tag = &element[..start_tag_end(element)];
    let declaration = if name.starts_with(b"stream:") {
        (!declares(start_tag, b"xmlns:stream=")).then(|| format!(r#" xmlns:stream="{STREAMS_NS}""#))
    } else {
        (!declares(start_tag, b"xmlns=")).then(|| format!(r#" xmlns="{CLIENT_NS}""#))
    };
    let Some(declaration) = declaration else {
        return element.to_vec();
    };
    let name_end = 1 + name.len();
    let mut frame = Vec::with_capacity(element.len() + declaration.len());
    frame.extend_from_slice(&element[..name_end]);
    frame.extend_from_slice(declaration.as_bytes());
    frame.extend_from_slice(&element[name_end..]);
    frame
}

/// The name of the element that starts `element` (`<name ...`), prefix included.
pub fn root_name(element: &[u8]) -> &[u8] {
    let body = element.strip_prefix(b"<").unwrap_or(element);
    let end = body
        .iter()
        .position(|byte| byte.is_ascii_whitespace() || *byte == b'/' || *byte == b'>')
        .unwrap_or(body.len());
    &body[..end]
}

/// Index just past the `>` that closes the start tag; a `>` inside a quoted attribute does not
/// count.
fn start_tag_end(element: &[u8]) -> usize {
    let mut quote = None;
    for (index, byte) in element.iter().enumerate() {
        match (quote, byte) {
            (Some(open), byte) if byte == open => quote = None,
            (Some(_), _) => {}
            (None, b'"' | b'\'') => quote = Some(byte),
            (None, b'>') => return index + 1,
            (None, _) => {}
        }
    }
    element.len()
}

/// Whether the start tag carries the attribute `name=` (preceded by whitespace, so that
/// `xmlns=` does not match inside `xmlns:stream=`).
fn declares(start_tag: &[u8], name: &[u8]) -> bool {
    start_tag
        .windows(name.len() + 1)
        .any(|window| window[0].is_ascii_whitespace() && &window[1..] == name)
}

// --- helpers ----------------------------------------------------------------------------------

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
mod property_tests;
#[cfg(test)]
mod tests;
