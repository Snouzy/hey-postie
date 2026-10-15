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
fn a_mismatched_end_tag_is_an_error_at_once() {
    let mut splitter = Splitter::new();
    assert_eq!(
        splitter.push(b"<iq><query></iq>"),
        Err(FramingError::Malformed("mismatched end tag"))
    );
}

#[test]
fn an_element_over_the_limit_is_refused() {
    let mut splitter = Splitter::new();
    let huge = vec![b'x'; splitter::MAX_ELEMENT_BYTES + 1];
    assert!(splitter.push(b"<message><body>").unwrap().is_empty());
    assert_eq!(splitter.push(&huge), Err(FramingError::TooLarge));
}

#[test]
fn the_cut_does_not_depend_on_where_the_chunks_split() {
    let mut sample = HEADER.to_vec();
    sample.extend_from_slice(
        b"<stream:features><starttls xmlns='urn:ietf:params:xml:ns:xmpp-tls'/></stream:features>\n\
          <iq id='1' type='result'><query xmlns='x'><item a='>'/></query></iq>\
          <message><body><![CDATA[x<y]]></body><!-- c --></message></stream:stream>",
    );
    let expected = Splitter::new().push(&sample).unwrap();
    assert_eq!(expected.len(), 5, "header, features, iq, message, close");
    for cut in 0..=sample.len() {
        let mut splitter = Splitter::new();
        let mut items = splitter.push(&sample[..cut]).unwrap();
        items.extend(splitter.push(&sample[cut..]).unwrap());
        assert_eq!(items, expected, "split at byte {cut}");
    }
    let mut one_by_one = Splitter::new();
    let mut items = Vec::new();
    for byte in &sample {
        items.extend(one_by_one.push(std::slice::from_ref(byte)).unwrap());
    }
    assert_eq!(items, expected);
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
fn unprefixed_elements_get_the_client_namespace_unless_they_declare_one() {
    assert_eq!(
        element_to_frame(b"<message to='a@b'><body>hi</body></message>"),
        br#"<message xmlns="jabber:client" to='a@b'><body>hi</body></message>"#
    );
    assert_eq!(
        element_to_frame(b"<iq type='result'/>"),
        br#"<iq xmlns="jabber:client" type='result'/>"#
    );
    let sasl: &[u8] = b"<success xmlns='urn:ietf:params:xml:ns:xmpp-sasl'/>";
    assert_eq!(element_to_frame(sasl), sasl);
    let own: &[u8] = br#"<message xmlns="jabber:client" id="1"/>"#;
    assert_eq!(element_to_frame(own), own);
    let child_only: &[u8] = b"<message><x xmlns='jabber:x:oob'/></message>";
    assert_eq!(
        element_to_frame(child_only),
        br#"<message xmlns="jabber:client"><x xmlns='jabber:x:oob'/></message>"#,
        "a child's xmlns does not count"
    );
}

#[test]
fn a_declaration_after_a_quoted_angle_bracket_is_still_seen() {
    let declared: &[u8] =
        br#"<stream:features a='>' xmlns:stream="http://etherx.jabber.org/streams"/>"#;
    assert_eq!(element_to_frame(declared), declared);
    let message: &[u8] = br#"<message a=">" xmlns="jabber:client"><body>x</body></message>"#;
    assert_eq!(element_to_frame(message), message);
}

#[test]
fn parse_open_extracts_the_domain_lang_and_version() {
    let open = parse_open(
        r#"<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="example.org" xml:lang="fr" version="1.0"/>"#,
    )
    .unwrap();
    assert_eq!(
        open,
        OpenFrame {
            to: "example.org".into(),
            lang: Some("fr".into()),
            version: Some("1.0".into()),
        }
    );
    let bare = parse_open(r#"<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="x"/>"#).unwrap();
    assert_eq!(bare.lang, None);
    assert_eq!(bare.version, None);
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
    assert!(matches!(
        classify(r#"<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="x"/>"#),
        Ok(ClientFrame::Open(_))
    ));
    assert_eq!(
        classify(r#"<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>"#),
        Ok(ClientFrame::Close)
    );
    assert_eq!(classify("<iq type='get'/>"), Ok(ClientFrame::Stanza));
}

#[test]
fn classify_refuses_stream_markup_inside_a_frame() {
    for forged in [
        "<message/><stream:stream to='evil'>",
        "<message/></stream:stream>",
        "<message><body></stream:stream></body></message>",
    ] {
        assert_eq!(
            classify(forged),
            Err(FramingError::Malformed("stream markup in a frame")),
            "{forged}"
        );
    }
}

#[test]
fn the_stream_header_carries_to_version_and_lang() {
    let open = OpenFrame {
        to: "a&b.org".into(),
        lang: Some("fr".into()),
        version: None,
    };
    let header = stream_header(&open);
    assert!(header.starts_with("<?xml version='1.0'?><stream:stream "));
    assert!(header.contains("to='a&amp;b.org' version='1.0' xml:lang='fr'>"));
    let plain = stream_header(&OpenFrame {
        to: "x".into(),
        lang: None,
        version: Some("1.0".into()),
    });
    assert!(plain.ends_with("to='x' version='1.0'>"));
}
