//! Unit tests of the splitter: hand-written streams, chunk boundaries, errors and the size limit.

use super::*;

const HEADER: &[u8] = b"<?xml version='1.0'?><stream:stream xmlns='jabber:client' \
    xmlns:stream='http://etherx.jabber.org/streams' id='abc123' from='example.org' \
    xml:lang='en' version='1.0'>";

fn element(bytes: &[u8]) -> Item {
    Item::Element(bytes.to_vec())
}

/// The items of a push that must not fail.
fn ok(items: Vec<Result<Item, FramingError>>) -> Vec<Item> {
    items.into_iter().map(|item| item.unwrap()).collect()
}

#[test]
fn splits_the_header_then_each_top_level_element() {
    let mut splitter = Splitter::new();
    let mut input = HEADER.to_vec();
    input.extend_from_slice(b"<stream:features><mechanisms/></stream:features><iq id='1'/>");
    let items = ok(splitter.push(&input));
    assert_eq!(
        items,
        vec![
            Item::Header(HEADER[b"<?xml version='1.0'?>".len()..].to_vec()),
            element(b"<stream:features><mechanisms/></stream:features>"),
            element(b"<iq id='1'/>"),
        ]
    );
}

#[test]
fn an_element_split_across_chunks_is_emitted_once_complete() {
    let mut splitter = Splitter::new();
    assert!(ok(splitter.push(b"<message to='a@b'><bo")).is_empty());
    assert!(ok(splitter.push(b"dy>hi</body")).is_empty());
    let items = ok(splitter.push(b"></message><presen"));
    assert_eq!(
        items,
        vec![element(b"<message to='a@b'><body>hi</body></message>")]
    );
    assert_eq!(ok(splitter.push(b"ce/>")), vec![element(b"<presence/>")]);
}

#[test]
fn a_stanza_ending_exactly_at_the_chunk_boundary() {
    let mut splitter = Splitter::new();
    assert_eq!(
        ok(splitter.push(b"<r xmlns='urn:xmpp:sm:3'/>")),
        vec![element(b"<r xmlns='urn:xmpp:sm:3'/>")]
    );
    assert_eq!(
        ok(splitter.push(b"<a h='1'/>")),
        vec![element(b"<a h='1'/>")]
    );
}

#[test]
fn nested_elements_with_the_same_name_count_depth() {
    let mut splitter = Splitter::new();
    let items = ok(splitter.push(b"<iq><query><item><item/></item></query></iq>"));
    assert_eq!(
        items,
        vec![element(b"<iq><query><item><item/></item></query></iq>")]
    );
}

#[test]
fn text_cdata_and_quoted_attributes_may_contain_angle_brackets() {
    let mut splitter = Splitter::new();
    let stanza: &[u8] = b"<message><body>a > b</body><x attr='>' other=\"</x>\"/>\
        <![CDATA[<not>a</tag>]]><!-- <also> not --></message>";
    let items = ok(splitter.push(stanza));
    assert_eq!(items, vec![element(stanza)]);
}

#[test]
fn cdata_containing_a_lone_angle_bracket_still_terminates() {
    let mut splitter = Splitter::new();
    let stanza: &[u8] = b"<message><![CDATA[x<y]]></message>";
    assert_eq!(ok(splitter.push(stanza)), vec![element(stanza)]);
}

#[test]
fn whitespace_keepalives_between_stanzas_are_dropped() {
    let mut splitter = Splitter::new();
    assert!(ok(splitter.push(b" \n ")).is_empty());
    assert_eq!(ok(splitter.push(b"<a/>\n")), vec![element(b"<a/>")]);
}

#[test]
fn the_stream_close_is_detected() {
    let mut splitter = Splitter::new();
    let mut input = HEADER.to_vec();
    input.extend_from_slice(b"<iq/></stream:stream>");
    let items = ok(splitter.push(&input));
    assert_eq!(items.len(), 3);
    assert_eq!(items[2], Item::Close);
}

#[test]
fn a_stray_end_tag_is_an_error() {
    let mut splitter = Splitter::new();
    assert_eq!(
        splitter.push(b"</iq>"),
        vec![Err(FramingError::Malformed("end tag without start"))]
    );
}

#[test]
fn a_mismatched_end_tag_is_an_error_at_once() {
    let mut splitter = Splitter::new();
    assert_eq!(
        splitter.push(b"<iq><query></iq>"),
        vec![Err(FramingError::Malformed("mismatched end tag"))]
    );
}

#[test]
fn an_element_over_the_limit_is_refused() {
    let mut splitter = Splitter::new();
    let huge = vec![b'x'; MAX_ELEMENT_BYTES + 1];
    assert!(ok(splitter.push(b"<message><body>")).is_empty());
    assert_eq!(splitter.push(&huge), vec![Err(FramingError::TooLarge)]);
}

/// `<message><body>x…x</body></message>` of exactly `size` bytes.
fn message_of(size: usize) -> Vec<u8> {
    let (head, tail): (&[u8], &[u8]) = (b"<message><body>", b"</body></message>");
    let mut bytes = head.to_vec();
    bytes.resize(size - tail.len(), b'x');
    bytes.extend_from_slice(tail);
    assert_eq!(bytes.len(), size);
    bytes
}

#[test]
fn an_element_at_the_limit_passes_and_one_byte_more_is_refused_whatever_the_chunking() {
    let largest = message_of(MAX_ELEMENT_BYTES);
    let too_large = message_of(MAX_ELEMENT_BYTES + 1);
    for cut in [0, 1, 4096, MAX_ELEMENT_BYTES / 2] {
        let mut splitter = Splitter::new();
        assert!(ok(splitter.push(&largest[..cut])).is_empty());
        assert_eq!(
            ok(splitter.push(&largest[cut..])),
            vec![element(&largest)],
            "cut at {cut}"
        );
        let mut splitter = Splitter::new();
        assert!(ok(splitter.push(&too_large[..cut])).is_empty());
        assert_eq!(
            splitter.push(&too_large[cut..]),
            vec![Err(FramingError::TooLarge)],
            "cut at {cut}"
        );
    }
}

/// Regression: the limit used to count every byte of the read, not only the element being
/// scanned, so a small stanza followed by a large (but allowed) one in the same read was refused.
#[test]
fn a_small_element_followed_by_a_large_one_in_the_same_read_is_not_refused() {
    let mut input = b"<a/>".to_vec();
    let large = message_of(MAX_ELEMENT_BYTES);
    input.extend_from_slice(&large);
    assert_eq!(
        ok(Splitter::new().push(&input)),
        vec![element(b"<a/>"), element(&large)]
    );
}

#[test]
fn the_cut_does_not_depend_on_where_the_chunks_split() {
    let mut sample = HEADER.to_vec();
    sample.extend_from_slice(
        b"<stream:features><starttls xmlns='urn:ietf:params:xml:ns:xmpp-tls'/></stream:features>\n\
          <iq id='1' type='result'><query xmlns='x'><item a='>'/></query></iq>\
          <message><body><![CDATA[x<y]]></body><!-- c --></message></stream:stream>",
    );
    let expected = ok(Splitter::new().push(&sample));
    assert_eq!(expected.len(), 5, "header, features, iq, message, close");
    for cut in 0..=sample.len() {
        let mut splitter = Splitter::new();
        let mut items = ok(splitter.push(&sample[..cut]));
        items.extend(ok(splitter.push(&sample[cut..])));
        assert_eq!(items, expected, "split at byte {cut}");
    }
    let mut one_by_one = Splitter::new();
    let mut items = Vec::new();
    for byte in &sample {
        items.extend(ok(one_by_one.push(std::slice::from_ref(byte))));
    }
    assert_eq!(items, expected);
}
