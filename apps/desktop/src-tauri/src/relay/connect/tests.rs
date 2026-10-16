use super::*;
use crate::relay::test_support::{fake_server, server_header, Step, TLS_NS};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio_rustls::rustls::pki_types::PrivateKeyDer;
use tokio_rustls::rustls::ServerConfig;
use tokio_rustls::TlsAcceptor;

fn candidate(address: std::net::SocketAddr, security: Security) -> Candidate {
    Candidate {
        host: address.ip().to_string(),
        port: address.port(),
        security,
    }
}

// --- STARTTLS -------------------------------------------------------------------------------

async fn negotiate(script: Vec<Step>) -> Result<TcpStream, RelayError> {
    let server = fake_server(script).await;
    let tcp = TcpStream::connect(server).await.unwrap();
    negotiate_starttls(tcp, "example.org").await
}

#[tokio::test]
async fn starttls_succeeds_with_features_split_across_two_reads() {
    let outcome = negotiate(vec![
        (
            "<stream:stream",
            vec![
                format!("{}<stream:features><start", server_header("one")),
                format!("tls xmlns='{TLS_NS}'/></stream:features>"),
            ],
        ),
        ("<starttls", vec![format!("<proceed xmlns='{TLS_NS}'/>")]),
    ])
    .await;
    assert!(outcome.is_ok(), "{outcome:?}");
}

#[tokio::test]
async fn starttls_fails_when_the_feature_is_missing() {
    let outcome = negotiate(vec![(
        "<stream:stream",
        vec![format!(
            "{}<stream:features><starttlsx/><mechanisms xmlns='urn:ietf:params:xml:ns:xmpp-sasl'/>\
             </stream:features>",
            server_header("one")
        )],
    )])
    .await;
    assert!(
        matches!(&outcome, Err(RelayError::StreamError(reason)) if reason.contains("no STARTTLS")),
        "{outcome:?}"
    );
}

#[tokio::test]
async fn starttls_fails_when_the_server_answers_failure() {
    let outcome = negotiate(vec![
        (
            "<stream:stream",
            vec![format!(
                "{}<stream:features><starttls xmlns='{TLS_NS}'><required/></starttls>\
                 </stream:features>",
                server_header("one")
            )],
        ),
        ("<starttls", vec![format!("<failure xmlns='{TLS_NS}'/>")]),
    ])
    .await;
    assert!(
        matches!(&outcome, Err(RelayError::StreamError(reason)) if reason.contains("refused")),
        "{outcome:?}"
    );
}

#[test]
fn has_child_matches_whole_names_only() {
    assert!(has_child(b"<f><starttls/></f>", b"starttls"));
    assert!(has_child(
        b"<f><starttls xmlns='x'><required/></starttls></f>",
        b"starttls"
    ));
    assert!(!has_child(b"<f><starttlsx/></f>", b"starttls"));
    assert!(!has_child(b"<f>starttls</f>", b"starttls"));
}

mod has_child_properties {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn never_panics(element in prop::collection::vec(any::<u8>(), 0..64), name in "[a-z]{0,8}") {
            let _ = has_child(&element, name.as_bytes());
        }

        #[test]
        fn finds_a_whole_name_and_not_a_longer_one(
            name in "[a-z]{1,8}",
            tail in prop::sample::select(vec!["/>", ">", " x='1'/>", "\n/>"]),
            suffix in "[a-z0-9]{1,3}",
        ) {
            // The wrapper is named `_`, which the name strategy never draws.
            let present = format!("<_><{name}{tail}</_>");
            prop_assert!(has_child(present.as_bytes(), name.as_bytes()));
            let longer = format!("<_><{name}{suffix}{tail}</_>");
            prop_assert!(!has_child(longer.as_bytes(), name.as_bytes()));
            let text = format!("<_>{name}</_>");
            prop_assert!(!has_child(text.as_bytes(), name.as_bytes()));
        }
    }
}

// --- certificates ---------------------------------------------------------------------------

/// A TLS server with a self-signed certificate: no OS root trusts it.
async fn self_signed_server() -> std::net::SocketAddr {
    let key = rcgen::generate_simple_self_signed(vec!["localhost".to_owned()]).unwrap();
    let config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(
            vec![key.cert.der().clone()],
            PrivateKeyDer::Pkcs8(key.signing_key.serialize_der().into()),
        )
        .unwrap();
    let acceptor = TlsAcceptor::from(Arc::new(config));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let (tcp, _) = listener.accept().await.unwrap();
        // The client is expected to abort the handshake.
        let _ = acceptor.accept(tcp).await;
    });
    address
}

/// A plain server that counts connections and closes them at once.
async fn counting_server() -> (std::net::SocketAddr, Arc<AtomicUsize>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let count = Arc::new(AtomicUsize::new(0));
    let seen = count.clone();
    tokio::spawn(async move {
        while let Ok((tcp, _)) = listener.accept().await {
            seen.fetch_add(1, Ordering::SeqCst);
            drop(tcp);
        }
    });
    (address, count)
}

#[tokio::test]
async fn a_rejected_certificate_stops_the_search() {
    let tls = self_signed_server().await;
    let (next, count) = counting_server().await;
    let candidates = Candidates {
        list: vec![
            candidate(tls, Security::DirectTls),
            candidate(next, Security::StartTls),
        ],
        guessed: false,
    };
    let outcome = connect_any(&candidates, "localhost").await;
    assert!(
        matches!(outcome, Err(RelayError::CertificateInvalid)),
        "{outcome:?}"
    );
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(
        count.load(Ordering::SeqCst),
        0,
        "the next candidate was not tried"
    );
}

#[tokio::test]
async fn guessed_candidates_go_on_to_5222_after_a_certificate_problem() {
    let tls = self_signed_server().await;
    let (next, count) = counting_server().await;
    let candidates = Candidates {
        list: vec![
            candidate(tls, Security::DirectTls),
            candidate(next, Security::StartTls),
        ],
        guessed: true,
    };
    let outcome = connect_any(&candidates, "localhost").await;
    assert!(
        matches!(outcome, Err(RelayError::ServerUnreachable(_))),
        "{outcome:?}"
    );
    assert_eq!(
        count.load(Ordering::SeqCst),
        1,
        "the STARTTLS port was tried"
    );
}
