//! Property tests of the frame translation: no panic on anything the webview or the server may
//! send, and the attributes survive the round trip through our own markup.

use super::*;
use proptest::prelude::*;

/// Attribute values as XML can carry them: no control characters (a tab or a line feed would be
/// normalised to a space by the parser, which is the XML rule, not a relay bug).
fn attribute_value() -> impl Strategy<Value = String> {
    "[^\\x00-\\x1F\\x7F]{1,24}"
}

fn open_frame() -> impl Strategy<Value = OpenFrame> {
    (
        attribute_value(),
        prop::option::of(attribute_value()),
        prop::option::of(attribute_value()),
    )
        .prop_map(|(to, lang, version)| OpenFrame { to, lang, version })
}

/// The `<open/>` frame Strophe would send for this request.
fn open_markup(open: &OpenFrame) -> String {
    let mut frame = format!(
        r#"<open xmlns="{FRAMING_NS}" to="{}""#,
        escape(open.to.as_str())
    );
    if let Some(lang) = &open.lang {
        frame.push_str(&format!(r#" xml:lang="{}""#, escape(lang.as_str())));
    }
    if let Some(version) = &open.version {
        frame.push_str(&format!(r#" version="{}""#, escape(version.as_str())));
    }
    frame.push_str("/>");
    frame
}

proptest! {
    #[test]
    fn classify_never_panics_and_an_open_frame_always_has_a_domain(frame in ".{0,200}") {
        if let Ok(ClientFrame::Open(open)) = classify(&frame) {
            prop_assert!(!open.to.is_empty());
        }
        let _ = parse_open(&frame);
    }

    #[test]
    fn stream_markup_is_refused_wherever_it_sits(
        before in "[^<]{0,20}",
        markup in prop::sample::select(vec!["<stream:stream", "</stream:stream"]),
        after in ".{0,20}",
    ) {
        let frame = format!("{before}{markup}{after}");
        prop_assert_eq!(classify(&frame), Err(FramingError::Malformed("stream markup in a frame")));
    }

    #[test]
    fn an_open_frame_round_trips_through_its_markup(open in open_frame()) {
        prop_assert_eq!(parse_open(&open_markup(&open)), Ok(open));
    }

    #[test]
    fn the_stream_header_carries_the_request_back_out(open in open_frame()) {
        let header = stream_header(&open);
        let root = root_element(&header).expect("the header parses");
        prop_assert_eq!(root.name().into_inner(), "stream:stream");
        prop_assert_eq!(attribute(&root, "to"), Some(open.to.clone()));
        prop_assert_eq!(attribute(&root, "xml:lang"), open.lang.clone());
        prop_assert_eq!(
            attribute(&root, "version"),
            Some(open.version.clone().unwrap_or_else(|| "1.0".to_owned()))
        );
    }

    #[test]
    fn header_to_open_never_panics(header in prop::collection::vec(any::<u8>(), 0..200)) {
        let _ = header_to_open(&header);
    }

    #[test]
    fn the_server_header_becomes_an_open_frame_with_the_same_attributes(
        from in attribute_value(),
        id in attribute_value(),
        lang in prop::option::of(attribute_value()),
    ) {
        let mut header = format!(
            "<stream:stream xmlns='jabber:client' xmlns:stream='{STREAMS_NS}' from='{}' id='{}'",
            escape(from.as_str()),
            escape(id.as_str())
        );
        if let Some(lang) = &lang {
            header.push_str(&format!(" xml:lang='{}'", escape(lang.as_str())));
        }
        header.push_str(" version='1.0'>");
        let open = header_to_open(header.as_bytes()).expect("a header");
        let root = root_element(&open).expect("the open frame parses");
        prop_assert_eq!(root.name().into_inner(), "open");
        prop_assert_eq!(attribute(&root, "xmlns"), Some(FRAMING_NS.to_owned()));
        prop_assert_eq!(attribute(&root, "from"), Some(from));
        prop_assert_eq!(attribute(&root, "id"), Some(id));
        prop_assert_eq!(attribute(&root, "xml:lang"), lang);
    }

    #[test]
    fn element_to_frame_never_panics(element in prop::collection::vec(any::<u8>(), 0..64)) {
        let _ = element_to_frame(&element);
    }

    #[test]
    fn element_to_frame_only_ever_adds_one_declaration_after_the_name(
        name in "([a-z][a-z0-9]{0,8})|(stream:[a-z]{1,8})",
        attributes in "( [a-z]+=('[^']*'|\"[^\"]*\")){0,3}"
            .prop_filter("no namespace of its own", |attributes| !attributes.contains("xmlns")),
        body in prop::option::of("[^<]{0,10}"),
    ) {
        let element = match &body {
            Some(body) => format!("<{name}{attributes}>{body}</{name}>"),
            None => format!("<{name}{attributes}/>"),
        };
        let frame = element_to_frame(element.as_bytes());
        prop_assert_eq!(root_name(&frame), name.as_bytes());
        let declaration = if name.starts_with("stream:") {
            format!(r#" xmlns:stream="{STREAMS_NS}""#)
        } else {
            format!(r#" xmlns="{CLIENT_NS}""#)
        };
        let expected = format!("<{name}{declaration}{}", &element[1 + name.len()..]);
        prop_assert_eq!(std::str::from_utf8(&frame).unwrap(), expected.as_str());
        // Idempotent: a frame that declares its namespace is left alone.
        let declared = element_to_frame(expected.as_bytes());
        prop_assert_eq!(declared, expected.as_bytes());
    }
}
