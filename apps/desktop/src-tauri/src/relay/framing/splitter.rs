//! Cuts the TCP byte stream into top-level elements. A small hand-written state machine rather
//! than a full XML parser: the stream never ends, elements arrive split across reads, and the
//! only question is "where does this element stop?". The element bytes are then forwarded
//! untouched, so the client sees exactly what the server sent.

use super::FramingError;

/// A stanza larger than this is not a chat message; drop the connection instead of buffering.
pub const MAX_ELEMENT_BYTES: usize = 8 * 1024 * 1024;

/// What the splitter cuts out of the TCP byte stream.
#[derive(Debug, PartialEq, Eq)]
pub enum Item {
    /// `<stream:stream ...>`, the bytes of the start tag only.
    Header(Vec<u8>),
    /// A complete top-level element, exactly as the server sent it.
    Element(Vec<u8>),
    /// `</stream:stream>`.
    Close,
}

/// Where the scanner is inside the markup. Text between elements needs no state of its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    Text,
    /// Just after `<`: the next byte says what kind of markup follows.
    AfterLt,
    /// Just after `<!`: a comment or a CDATA section.
    AfterBang,
    Comment,
    Cdata,
    /// `<?xml ...?>` and other processing instructions.
    Pi,
    StartName,
    /// Inside a start tag, after the name: attributes.
    StartTag,
    /// Inside a quoted attribute value; `>` is just a character there.
    Quoted(u8),
    EndTag,
}

/// Cuts a byte stream into top-level elements, tolerating elements split across chunks.
#[derive(Debug)]
pub struct Splitter {
    buf: Vec<u8>,
    /// Next byte to look at.
    pos: usize,
    /// Where the markup being scanned started (an element, a comment, ...).
    start: usize,
    /// Open elements inside the current top-level element, outermost first. The stream header
    /// is not on it: the stream is the document, its children are what we cut out.
    stack: Vec<Vec<u8>>,
    state: State,
    /// Position of the `<` that opened the markup being scanned (tag, comment, CDATA, PI).
    markup_start: usize,
    /// Name of the tag being scanned, to recognise `stream:stream`.
    name: Vec<u8>,
}

impl Default for Splitter {
    fn default() -> Self {
        Self::new()
    }
}

impl Splitter {
    pub fn new() -> Self {
        Splitter {
            buf: Vec::new(),
            pos: 0,
            start: 0,
            stack: Vec::new(),
            state: State::Text,
            markup_start: 0,
            name: Vec::new(),
        }
    }

    /// Feeds bytes and returns every item completed by them, in order. An error comes last, after
    /// the items completed before it, so that what the caller sees never depends on how the
    /// bytes were chunked; the splitter is not usable after an error.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<Result<Item, FramingError>> {
        self.buf.extend_from_slice(bytes);
        let mut items = Vec::new();
        while self.pos < self.buf.len() {
            // Only the element being scanned counts, not what follows it in the same read.
            if self.pos - self.start >= MAX_ELEMENT_BYTES {
                items.push(Err(FramingError::TooLarge));
                return items;
            }
            let byte = self.buf[self.pos];
            match self.step(byte) {
                Err(error) => {
                    items.push(Err(error));
                    return items;
                }
                Ok(Some(item)) => {
                    items.push(Ok(item));
                    // Everything up to and including this byte is consumed.
                    self.buf.drain(..=self.pos);
                    self.pos = 0;
                    self.start = 0;
                    continue;
                }
                Ok(None) => self.pos += 1,
            }
        }
        if self.state == State::Text && self.stack.is_empty() {
            // Whitespace between stanzas (keep-alives): nothing to keep.
            self.buf.clear();
            self.pos = 0;
            self.start = 0;
        }
        items
    }

    fn step(&mut self, byte: u8) -> Result<Option<Item>, FramingError> {
        match self.state {
            State::Text => {
                if byte == b'<' {
                    if self.stack.is_empty() {
                        self.start = self.pos;
                    }
                    self.markup_start = self.pos;
                    self.state = State::AfterLt;
                }
            }
            State::AfterLt => {
                self.name.clear();
                self.state = match byte {
                    b'!' => State::AfterBang,
                    b'?' => State::Pi,
                    b'/' => State::EndTag,
                    _ => {
                        self.name.push(byte);
                        State::StartName
                    }
                };
            }
            State::AfterBang => {
                self.state = match byte {
                    b'-' => State::Comment,
                    b'[' => State::Cdata,
                    _ => return Err(FramingError::Malformed("doctype")),
                };
            }
            State::Comment => {
                if byte == b'>' && self.ends_with(b"--") && self.pos >= self.markup_start + 6 {
                    self.state = State::Text;
                }
            }
            State::Cdata => {
                if byte == b'>' && self.ends_with(b"]]") && self.pos >= self.markup_start + 11 {
                    self.state = State::Text;
                }
            }
            State::Pi => {
                if byte == b'>' && self.ends_with(b"?") {
                    self.state = State::Text;
                }
            }
            State::StartName => match byte {
                b'>' => return self.finish_start_tag(),
                b'/' => self.state = State::StartTag,
                b if b.is_ascii_whitespace() => self.state = State::StartTag,
                _ => self.name.push(byte),
            },
            State::StartTag => match byte {
                b'>' => return self.finish_start_tag(),
                b'"' | b'\'' => self.state = State::Quoted(byte),
                _ => {}
            },
            State::Quoted(quote) => {
                if byte == quote {
                    self.state = State::StartTag;
                }
            }
            State::EndTag => match byte {
                b'>' => return self.finish_end_tag(),
                b if b.is_ascii_whitespace() => {}
                _ => self.name.push(byte),
            },
        }
        Ok(None)
    }

    fn finish_start_tag(&mut self) -> Result<Option<Item>, FramingError> {
        self.state = State::Text;
        let empty = self.buf[self.pos - 1] == b'/';
        let markup = self.buf[self.start..=self.pos].to_vec();
        if self.stack.is_empty() && is_stream_root(&self.name) && !empty {
            return Ok(Some(Item::Header(markup)));
        }
        if empty {
            return Ok(self.stack.is_empty().then_some(Item::Element(markup)));
        }
        self.stack.push(std::mem::take(&mut self.name));
        Ok(None)
    }

    fn finish_end_tag(&mut self) -> Result<Option<Item>, FramingError> {
        self.state = State::Text;
        let Some(open) = self.stack.pop() else {
            return if is_stream_root(&self.name) {
                Ok(Some(Item::Close))
            } else {
                Err(FramingError::Malformed("end tag without start"))
            };
        };
        if open != self.name {
            return Err(FramingError::Malformed("mismatched end tag"));
        }
        if self.stack.is_empty() {
            return Ok(Some(Item::Element(
                self.buf[self.start..=self.pos].to_vec(),
            )));
        }
        Ok(None)
    }

    fn ends_with(&self, tail: &[u8]) -> bool {
        self.buf[..self.pos].ends_with(tail)
    }
}

/// `stream:stream` or, without a prefix, `stream`.
fn is_stream_root(name: &[u8]) -> bool {
    name == b"stream:stream" || name == b"stream"
}

#[cfg(test)]
mod property_tests;
#[cfg(test)]
mod tests;
