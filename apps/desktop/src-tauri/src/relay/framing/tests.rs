use super::*;

const HEADER: &[u8] = b"<?xml version='1.0'?><stream:stream xmlns='jabber:client' \
    xmlns:stream='http://etherx.jabber.org/streams' id='abc123' from='example.org' \
    xml:lang='en' version='1.0'>";

/// Regression: an empty slice (or one that is not a tag) made `element_to_frame` panic.
#[test]
fn element_to_frame_leaves_what_is_not_a_tag_alone() {
    assert_eq!(element_to_frame(b""), b"");
    assert_eq!(element_to_frame(b"x"), b"x");
    assert_eq!(element_to_frame(b"<"), b"<");
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
