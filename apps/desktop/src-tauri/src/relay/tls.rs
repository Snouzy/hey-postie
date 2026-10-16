//! TLS towards the XMPP server with `rustls`, the certificate checked by the operating system.
//!
//! `rustls-platform-verifier` hands the chain to the OS verifier (Security framework on macOS,
//! CryptoAPI on Windows), so the app trusts exactly what the system and its browsers trust,
//! including a missing intermediate fetched from the certificate's AIA address. Decision of
//! 2026-10-16, reversing the one of 2026-10-15 (plain `rustls-native-certs` + webpki): a real
//! server sends its leaf without its CA's intermediate certificate; Gajim and macOS
//! accept it, webpki refused it with `UnknownIssuer`. The crate was already in the tree through
//! `reqwest` (the updater). On Linux it falls back to webpki with the system roots, so such a
//! server still fails there. The OS also brings revocation checks.

use std::sync::{Arc, OnceLock};

use rustls_platform_verifier::ConfigVerifierExt;
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::ClientConfig;
use tokio_rustls::TlsConnector;

use super::RelayError;

/// The domain as TLS will check it: an ASCII host name (RFC 1123 labels, underscores tolerated)
/// or an IP literal. Checked before any DNS or TCP work, so that a domain TLS could never
/// verify (a space, a unicode label, an empty label) is refused at once. A unicode domain must
/// be given in its punycode form; the relay does no IDNA conversion (decision of 2026-10-16:
/// no `idna` dependency for version 1, the servers in use have ASCII names).
pub fn server_name(domain: &str) -> Result<ServerName<'static>, RelayError> {
    ServerName::try_from(domain.to_owned())
        .map_err(|_| RelayError::StreamError("domain is not a valid server name".into()))
}

/// Secures `tcp` for `domain`: SNI and certificate check both use the XMPP domain, not the SRV
/// target, as RFC 6120 section 13.7.2 requires.
pub async fn connect(tcp: TcpStream, domain: &str) -> Result<TlsStream<TcpStream>, RelayError> {
    let name = server_name(domain)?;
    TlsConnector::from(config()?)
        .connect(name, tcp)
        .await
        .map_err(classify)
}

/// The client configuration, built on first use and shared by every session.
fn config() -> Result<Arc<ClientConfig>, RelayError> {
    static CONFIG: OnceLock<Arc<ClientConfig>> = OnceLock::new();
    if let Some(config) = CONFIG.get() {
        return Ok(config.clone());
    }
    let config = ClientConfig::with_platform_verifier().map_err(|error| {
        log::debug!("platform verifier unavailable: {error}");
        RelayError::StreamError("the system certificate verifier is unavailable".into())
    })?;
    Ok(CONFIG.get_or_init(|| Arc::new(config)).clone())
}

/// Anything wrong with the certificate chain is the one failure the user must hear about
/// precisely, and the one that must never lead to trying another candidate.
fn classify(error: std::io::Error) -> RelayError {
    use tokio_rustls::rustls::Error;
    let rustls_error = error
        .get_ref()
        .and_then(|inner| inner.downcast_ref::<Error>());
    match rustls_error {
        Some(
            Error::InvalidCertificate(_)
            | Error::InvalidCertRevocationList(_)
            | Error::NoCertificatesPresented
            | Error::UnsupportedNameType,
        ) => {
            log::debug!("certificate rejected: {rustls_error:?}");
            RelayError::CertificateInvalid
        }
        _ => RelayError::ServerUnreachable(format!("tls handshake: {}", error.kind())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_rustls::rustls::{CertificateError, Error};

    fn io(error: Error) -> std::io::Error {
        std::io::Error::new(std::io::ErrorKind::InvalidData, error)
    }

    #[test]
    fn a_rejected_certificate_is_reported_as_such() {
        let error = classify(io(Error::InvalidCertificate(
            CertificateError::NotValidForName,
        )));
        assert!(matches!(error, RelayError::CertificateInvalid));
        let error = classify(io(Error::NoCertificatesPresented));
        assert!(matches!(error, RelayError::CertificateInvalid));
    }

    #[test]
    fn a_domain_is_a_host_name_or_an_ip_literal() {
        for valid in [
            "example.org",
            "localhost",
            "xn--mnchen-3ya.de",
            "127.0.0.1",
            "::1",
        ] {
            assert!(server_name(valid).is_ok(), "{valid}");
        }
        for invalid in [
            "",
            " ",
            "münchen.de",
            "example.org:5222",
            "a b.org",
            "[::1]",
        ] {
            assert!(server_name(invalid).is_err(), "{invalid:?}");
        }
    }

    mod properties {
        use super::*;
        use proptest::prelude::*;

        fn host_name() -> impl Strategy<Value = String> {
            prop::collection::vec("[a-z]([a-z0-9-]{0,10}[a-z0-9])?", 1..4)
                .prop_map(|labels| labels.join("."))
        }

        proptest! {
            #[test]
            fn never_panics(domain in ".{0,300}") {
                let _ = server_name(&domain);
            }

            #[test]
            fn plain_host_names_and_ip_literals_are_accepted(
                host in host_name(),
                ip in any::<std::net::IpAddr>(),
            ) {
                prop_assert!(server_name(&host).is_ok(), "{host}");
                prop_assert!(server_name(&ip.to_string()).is_ok(), "{ip}");
            }

            #[test]
            fn anything_outside_the_dns_alphabet_is_refused(
                host in host_name(),
                at in 0..32usize,
                stray in "[^a-zA-Z0-9._-]",
            ) {
                let mut spoiled = host.clone();
                spoiled.insert_str(at.min(host.len()), &stray);
                prop_assert!(server_name(&spoiled).is_err(), "{spoiled:?}");
            }

            #[test]
            fn a_label_over_63_or_a_name_over_253_bytes_is_refused(extra in 0..20usize) {
                let long_label = format!("{}.org", "a".repeat(64 + extra));
                let long_name = ["abcdefghij"; 26].join(".");
                prop_assert!(long_name.len() > 253);
                let refused = server_name(&long_label).is_err() && server_name(&long_name).is_err();
                prop_assert!(refused);
            }
        }
    }

    #[test]
    fn any_other_handshake_failure_is_unreachable() {
        let error = classify(io(Error::HandshakeNotComplete));
        assert!(matches!(error, RelayError::ServerUnreachable(_)));
        let error = classify(std::io::Error::from(std::io::ErrorKind::ConnectionReset));
        assert!(matches!(error, RelayError::ServerUnreachable(_)));
    }
}
