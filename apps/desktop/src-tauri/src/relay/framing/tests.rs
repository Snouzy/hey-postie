use super::*;

const HEADER: &[u8] = b"<?xml version='1.0'?><stream:stream xmlns='jabber:client' \
    xmlns:stream='http://etherx.jabber.org/streams' id='abc123' from='example.org' \
    xml:lang='en' version='1.0'>";

fn element(bytes: &[u8]) -> Item {
    Item::Element(bytes.to_vec())
}

#[test]
fn splits_the_header_then_each_top_level_element() {
    let mut splitter = Splitter::new();
    let mut input = HEADER.to_vec();
    input.extend_from_slice(b"<stream:features><mechanisms/></stream:features><iq id='1'/>");
    let items = splitter.push(&input).unwrap();
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
    assert!(splitter.push(b"<message to='a@b'><bo").unwrap().is_empty());
    assert!(splitter.push(b"dy>hi</body").unwrap().is_empty());
    let items = splitter.push(b"></message><presen").unwrap();
    assert_eq!(
        items,
        vec![element(b"<message to='a@b'><body>hi</body></message>")]
    );
    assert_eq!(
        splitter.push(b"ce/>").unwrap(),
        vec![element(b"<presence/>")]
    );
}

#[test]
fn a_stanza_ending_exactly_at_the_chunk_boundary() {
    let mut splitter = Splitter::new();
    assert_eq!(
        splitter.push(b"<r xmlns='urn:xmpp:sm:3'/>").unwrap(),
        vec![element(b"<r xmlns='urn:xmpp:sm:3'/>")]
    );
    assert_eq!(
        splitter.push(b"<a h='1'/>").unwrap(),
        vec![element(b"<a h='1'/>")]
    );
}

#[test]
fn nested_elements_with_the_same_name_count_depth() {
    let mut splitter = Splitter::new();
    let items = splitter
        .push(b"<iq><query><item><item/></item></query></iq>")
        .unwrap();
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
    let items = splitter.push(stanza).unwrap();
    assert_eq!(items, vec![element(stanza)]);
}

#[test]
fn cdata_containing_a_lone_angle_bracket_still_terminates() {
    let mut splitter = Splitter::new();
    let stanza: &[u8] = b"<message><![CDATA[x<y]]></message>";
    assert_eq!(splitter.push(stanza).unwrap(), vec![element(stanza)]);
}

#[test]
fn whitespace_keepalives_between_stanzas_are_dropped() {
    let mut splitter = Splitter::new();
    assert!(splitter.push(b" \n ").unwrap().is_empty());
    assert_eq!(splitter.push(b"<a/>\n").unwrap(), vec![element(b"<a/>")]);
}

#[test]
fn the_stream_close_is_detected() {
    let mut splitter = Splitter::new();
    let mut input = HEADER.to_vec();
    input.extend_from_slice(b"<iq/></stream:stream>");
    let items = splitter.push(&input).unwrap();
    assert_eq!(items.len(), 3);
    assert_eq!(items[2], Item::Close);
}

#[test]
fn a_stray_end_tag_is_an_error() {
    let mut splitter = Splitter::new();
    assert_eq!(
        splitter.push(b"</iq>"),
        Err(FramingError::Malformed("end tag without start"))
    );
}

#[test]
fn reset_forgets_a_half_read_element() {
    let mut splitter = Splitter::new();
    assert!(splitter.push(b"<iq><que").unwrap().is_empty());
    splitter.reset();
    assert_eq!(splitter.push(b"<a/>").unwrap(), vec![element(b"<a/>")]);
}

#[test]
fn the_header_becomes_an_open_frame_with_id_from_and_lang() {
    let header = &HEADER[b"<?xml version='1.0'?>".len()..];
    assert_eq!(
        header_to_open(header).unwrap(),
        r#"<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" from="example.org" id="abc123" xml:lang="en" version="1.0"/>"#
    );
    let minimal = header_to_open(b"<stream:stream xmlns='jabber:client' version='1.0'>").unwrap();
    assert_eq!(
        minimal,
        r#"<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" version="1.0"/>"#
    );
}

#[test]
fn stream_prefixed_elements_get_their_namespace_declared() {
    let frame = element_to_frame(b"<stream:features><bind/></stream:features>");
    assert_eq!(
        frame,
        br#"<stream:features xmlns:stream="http://etherx.jabber.org/streams"><bind/></stream:features>"#
    );
    let error = element_to_frame(b"<stream:error><conflict/></stream:error>");
    assert!(error.starts_with(br#"<stream:error xmlns:stream="#));
    let empty = element_to_frame(b"<stream:features/>");
    assert_eq!(
        empty,
        br#"<stream:features xmlns:stream="http://etherx.jabber.org/streams"/>"#
    );
}

#[test]
fn elements_already_declaring_the_prefix_or_without_it_are_untouched() {
    let declared: &[u8] = br#"<stream:features xmlns:stream="http://etherx.jabber.org/streams"/>"#;
    assert_eq!(element_to_frame(declared), declared);
    let iq: &[u8] = b"<iq type='result'/>";
    assert_eq!(element_to_frame(iq), iq);
}

#[test]
fn parse_open_extracts_the_domain() {
    let to = parse_open(
        r#"<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="example.org" version="1.0"/>"#,
    );
    assert_eq!(to.unwrap(), "example.org");
}

#[test]
fn parse_open_rejects_anything_else_first() {
    assert_eq!(
        parse_open(r#"<presence/>"#),
        Err(FramingError::NotAnOpenFrame)
    );
    assert_eq!(
        parse_open(r#"<open to="example.org"/>"#),
        Err(FramingError::NotAnOpenFrame),
        "the framing namespace is required"
    );
    assert_eq!(
        parse_open(r#"<open xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>"#),
        Err(FramingError::NotAnOpenFrame),
        "a `to` is required"
    );
    assert_eq!(parse_open("not xml"), Err(FramingError::NotAnOpenFrame));
}

#[test]
fn classify_tells_open_close_and_stanzas_apart() {
    assert_eq!(
        classify(r#"<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="x"/>"#),
        ClientFrame::Open
    );
    assert_eq!(
        classify(r#"<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>"#),
        ClientFrame::Close
    );
    assert_eq!(classify("<iq type='get'/>"), ClientFrame::Stanza);
}

#[test]
fn the_stream_header_escapes_the_domain() {
    let header = stream_header("a&b.org");
    assert!(header.starts_with("<?xml version='1.0'?><stream:stream "));
    assert!(header.contains("to='a&amp;b.org'"));
    assert!(header.ends_with("version='1.0'>"));
}
