use super::*;
use crate::relay::test_support::{fake_server, server_header, Step, SASL_NS};
use std::net::SocketAddr;
use std::time::Duration;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::{accept_async, connect_async, MaybeTlsStream, WebSocketStream};

type Client = WebSocketStream<MaybeTlsStream<TcpStream>>;

const OPEN: &str =
    r#"<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="example.org" version="1.0"/>"#;
const CLOSE: &str = r#"<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>"#;

/// A relay session on a plain socket to `server` (what `bridge` hands over once TLS is up).
async fn relay_to(server: SocketAddr) -> Client {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    tokio::spawn(async move {
        let (tcp, _) = listener.accept().await.unwrap();
        let ws = accept_async(tcp).await.unwrap();
        let server = TcpStream::connect(server).await.unwrap();
        let open = framing::parse_open(OPEN).unwrap();
        run(ws, server, &open).await;
    });
    connect_async(url).await.unwrap().0
}

async fn send_text(client: &mut Client, text: &str) {
    client.send(Message::Text(text.into())).await.unwrap();
}

async fn next_message(client: &mut Client) -> Message {
    tokio::time::timeout(Duration::from_secs(5), client.next())
        .await
        .expect("a message within 5 s")
        .expect("an open connection")
        .expect("a frame")
}

async fn next_text(client: &mut Client) -> String {
    match next_message(client).await {
        Message::Text(text) => text.to_string(),
        other => panic!("expected a text frame, got {other:?}"),
    }
}

async fn next_close(client: &mut Client) -> Option<CloseFrame> {
    match next_message(client).await {
        Message::Close(frame) => frame,
        other => panic!("expected a close, got {other:?}"),
    }
}

fn login_script() -> Vec<Step> {
    let first = format!(
        "{}<stream:features><mechanisms xmlns='{SASL_NS}'><mechanism>PLAIN</mechanism>\
         </mechanisms></stream:features>",
        server_header("one")
    );
    let second = format!(
        "{}<stream:features><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'/>\
         </stream:features><message from='a@example.org'><body>hi</body></message>",
        server_header("two")
    );
    vec![
        ("<stream:stream", vec![first]),
        ("<auth", vec![format!("<success xmlns='{SASL_NS}'/>")]),
        ("<stream:stream", vec![second]),
        ("</stream:stream>", vec!["</stream:stream>".to_owned()]),
    ]
}

#[tokio::test]
async fn a_restart_after_success_sends_a_fresh_header_and_relays_the_new_stream() {
    let server = fake_server(login_script()).await;
    let mut client = relay_to(server).await;

    let open = next_text(&mut client).await;
    assert!(open.starts_with("<open "), "{open}");
    assert!(open.contains(r#"id="one""#), "{open}");
    let features = next_text(&mut client).await;
    assert!(
        features
            .starts_with(r#"<stream:features xmlns:stream="http://etherx.jabber.org/streams">"#),
        "{features}"
    );

    send_text(
        &mut client,
        &format!("<auth xmlns='{SASL_NS}' mechanism='PLAIN'>AGE=</auth>"),
    )
    .await;
    let success = next_text(&mut client).await;
    assert_eq!(
        success,
        format!("<success xmlns='{SASL_NS}'/>"),
        "SASL elements keep their xmlns"
    );

    send_text(&mut client, OPEN).await;
    let reopened = next_text(&mut client).await;
    assert!(
        reopened.contains(r#"id="two""#),
        "the server's new header: {reopened}"
    );
    let bind = next_text(&mut client).await;
    assert!(bind.contains("<bind "), "{bind}");
    let message = next_text(&mut client).await;
    assert!(
        message.starts_with(r#"<message xmlns="jabber:client" from="#),
        "stanzas get jabber:client: {message}"
    );

    send_text(&mut client, CLOSE).await;
    let close = next_close(&mut client).await;
    assert!(
        close.map(|frame| frame.reason.is_empty()).unwrap_or(true),
        "a clean close"
    );
}

#[tokio::test]
async fn a_restart_before_authentication_ends_the_session_with_a_stream_error() {
    let server = fake_server(login_script()).await;
    let mut client = relay_to(server).await;
    let _open = next_text(&mut client).await;
    let _features = next_text(&mut client).await;

    send_text(&mut client, OPEN).await;
    let close = next_close(&mut client).await.expect("a reason");
    assert_eq!(close.reason, "StreamError");
}

#[tokio::test]
async fn a_forged_stream_close_inside_a_frame_is_refused() {
    let server = fake_server(login_script()).await;
    let mut client = relay_to(server).await;
    let _open = next_text(&mut client).await;
    let _features = next_text(&mut client).await;

    send_text(&mut client, "<message/></stream:stream>").await;
    let close = next_close(&mut client).await.expect("a reason");
    assert_eq!(close.reason, "StreamError");
}

#[tokio::test]
async fn a_stream_error_from_the_server_is_forwarded_then_reported() {
    let error = format!(
        "{}<stream:error><conflict xmlns='urn:ietf:params:xml:ns:xmpp-streams'/>\
         </stream:error></stream:stream>",
        server_header("one")
    );
    let server = fake_server(vec![("<stream:stream", vec![error])]).await;
    let mut client = relay_to(server).await;

    let _open = next_text(&mut client).await;
    let forwarded = next_text(&mut client).await;
    assert!(
        forwarded.starts_with("<stream:error xmlns:stream="),
        "{forwarded}"
    );
    let close = next_close(&mut client).await.expect("a reason");
    assert_eq!(close.reason, "StreamError");
}

#[tokio::test]
async fn the_server_closing_the_stream_gives_a_close_frame_then_a_clean_close() {
    let bye = format!("{}</stream:stream>", server_header("one"));
    let server = fake_server(vec![("<stream:stream", vec![bye])]).await;
    let mut client = relay_to(server).await;

    let _open = next_text(&mut client).await;
    assert_eq!(next_text(&mut client).await, CLOSE);
    let close = next_close(&mut client).await;
    assert!(close.map(|frame| frame.reason.is_empty()).unwrap_or(true));
}
