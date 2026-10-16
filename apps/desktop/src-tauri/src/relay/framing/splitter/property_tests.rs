//! Property tests of the splitter: it never panics, its cut never depends on where the chunks
//! split, and a generated well-formed stream comes back element by element, byte for byte.

use super::*;
use proptest::prelude::*;

/// Feeds `bytes` in the given chunk sizes (the last chunk takes the rest). Returns every item
/// before the first error, and the error if there was one.
fn push_chunked(bytes: &[u8], sizes: &[usize]) -> (Vec<Item>, Result<(), FramingError>) {
    let mut splitter = Splitter::new();
    let mut items = Vec::new();
    let mut rest = bytes;
    let mut sizes = sizes.iter();
    while !rest.is_empty() {
        let size = sizes
            .next()
            .copied()
            .unwrap_or(rest.len())
            .clamp(1, rest.len());
        let (chunk, tail) = rest.split_at(size);
        rest = tail;
        for item in splitter.push(chunk) {
            match item {
                Ok(item) => items.push(item),
                Err(error) => return (items, Err(error)),
            }
        }
    }
    (items, Ok(()))
}

fn chunk_sizes() -> impl Strategy<Value = Vec<usize>> {
    prop::collection::vec(1usize..=48, 0..48)
}

proptest! {
    #[test]
    fn never_panics_and_never_holds_more_than_one_element_plus_one_chunk(
        bytes in prop::collection::vec(any::<u8>(), 0..1024),
        sizes in chunk_sizes(),
    ) {
        let mut splitter = Splitter::new();
        let mut rest: &[u8] = &bytes;
        let mut sizes = sizes.iter();
        while !rest.is_empty() {
            let size = sizes.next().copied().unwrap_or(rest.len()).clamp(1, rest.len());
            let (chunk, tail) = rest.split_at(size);
            rest = tail;
            if splitter.push(chunk).iter().any(Result::is_err) {
                break;
            }
            prop_assert!(splitter.buf.len() <= MAX_ELEMENT_BYTES + chunk.len());
        }
    }

    #[test]
    fn the_cut_does_not_depend_on_the_chunking_for_any_bytes(
        bytes in prop::collection::vec(prop::sample::select(b"<>/!?-[]'\" \nabcx:".to_vec()), 0..256),
        sizes in chunk_sizes(),
    ) {
        let whole = push_chunked(&bytes, &[]);
        let chunked = push_chunked(&bytes, &sizes);
        prop_assert_eq!(whole, chunked);
    }

    #[test]
    fn a_generated_stream_comes_back_element_by_element(
        stream in stream_strategy(),
        sizes in chunk_sizes(),
    ) {
        let (bytes, expected) = stream;
        let (items, outcome) = push_chunked(&bytes, &sizes);
        prop_assert_eq!(outcome, Ok(()));
        prop_assert_eq!(items, expected);
    }
}

// --- a generator of well-formed streams ---------------------------------------------------------

#[derive(Debug, Clone)]
enum Node {
    Element {
        name: String,
        attributes: Vec<(String, char, String)>,
        children: Vec<Node>,
        self_closing: bool,
    },
    Text(String),
    Cdata(String),
    Comment(String),
}

fn name() -> impl Strategy<Value = String> {
    "[a-z][a-z0-9]{0,6}(:[a-z][a-z0-9]{0,6})?".prop_filter("not the stream root", |name| {
        !is_stream_root(name.as_bytes())
    })
}

fn attribute() -> impl Strategy<Value = (String, char, String)> {
    prop_oneof![
        ("[a-z][a-z:]{0,5}", Just('\''), "[a-z<>\"/ ]{0,6}"),
        ("[a-z][a-z:]{0,5}", Just('"'), "[a-z<>'/ ]{0,6}"),
    ]
}

fn leaf() -> impl Strategy<Value = Node> {
    prop_oneof![
        "[a-z> ]{0,8}".prop_map(Node::Text),
        "[a-z<>/ ]{0,8}".prop_map(Node::Cdata),
        "[a-z<> ]{0,8}".prop_map(Node::Comment),
        (
            name(),
            prop::collection::vec(attribute(), 0..3),
            any::<bool>()
        )
            .prop_map(|(name, attributes, self_closing)| Node::Element {
                name,
                attributes,
                children: Vec::new(),
                self_closing,
            },),
    ]
}

fn node() -> impl Strategy<Value = Node> {
    leaf().prop_recursive(4, 24, 4, |inner| {
        (
            name(),
            prop::collection::vec(attribute(), 0..3),
            prop::collection::vec(inner, 1..4),
        )
            .prop_map(|(name, attributes, children)| Node::Element {
                name,
                attributes,
                children,
                self_closing: false,
            })
    })
}

fn element() -> impl Strategy<Value = Node> {
    node().prop_filter("a top-level item is an element", |node| {
        matches!(node, Node::Element { .. })
    })
}

fn write(node: &Node, out: &mut Vec<u8>) {
    match node {
        Node::Element {
            name,
            attributes,
            children,
            self_closing,
        } => {
            out.push(b'<');
            out.extend_from_slice(name.as_bytes());
            for (key, quote, value) in attributes {
                out.push(b' ');
                out.extend_from_slice(key.as_bytes());
                out.push(b'=');
                out.push(*quote as u8);
                out.extend_from_slice(value.as_bytes());
                out.push(*quote as u8);
            }
            if *self_closing && children.is_empty() {
                out.extend_from_slice(b"/>");
                return;
            }
            out.push(b'>');
            for child in children {
                write(child, out);
            }
            out.extend_from_slice(b"</");
            out.extend_from_slice(name.as_bytes());
            out.push(b'>');
        }
        Node::Text(text) => out.extend_from_slice(text.as_bytes()),
        Node::Cdata(text) => {
            out.extend_from_slice(b"<![CDATA[");
            out.extend_from_slice(text.as_bytes());
            out.extend_from_slice(b"]]>");
        }
        Node::Comment(text) => {
            out.extend_from_slice(b"<!--");
            out.extend_from_slice(text.as_bytes());
            out.extend_from_slice(b"-->");
        }
    }
}

const HEADER: &[u8] = b"<stream:stream xmlns='jabber:client' \
    xmlns:stream='http://etherx.jabber.org/streams' id='x' version='1.0'>";

/// A whole stream as bytes, with the items the splitter must produce for it.
fn stream_strategy() -> impl Strategy<Value = (Vec<u8>, Vec<Item>)> {
    (
        any::<bool>(),
        prop::collection::vec((element(), "[ \n\r\t]{0,2}"), 0..6),
        any::<bool>(),
    )
        .prop_map(|(with_header, elements, with_close)| {
            let mut bytes = Vec::new();
            let mut items = Vec::new();
            if with_header {
                bytes.extend_from_slice(b"<?xml version='1.0'?>");
                bytes.extend_from_slice(HEADER);
                items.push(Item::Header(HEADER.to_vec()));
            }
            for (element, gap) in elements {
                let mut serialized = Vec::new();
                write(&element, &mut serialized);
                bytes.extend_from_slice(&serialized);
                bytes.extend_from_slice(gap.as_bytes());
                items.push(Item::Element(serialized));
            }
            if with_close {
                bytes.extend_from_slice(b"</stream:stream>");
                items.push(Item::Close);
            }
            (bytes, items)
        })
}
