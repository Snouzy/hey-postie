//! TLS towards the XMPP server with `rustls`, trusting the operating system's root store.
//!
//! `rustls-native-certs` loads the OS roots once and `rustls`/`webpki` does the verification.
//! Decision of 2026-10-15: preferred over `rustls-platform-verifier` because it is a plain Rust
//! code path, identical on the three desktop platforms and in tests, with no extra native layer
//! to sandbox for the App Store. The price is no OS-level revocation check; acceptable for a
//! version 1 that only connects to the user's own server.

use std::sync::{Arc, OnceLock};

use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tokio_rustls::TlsConnector;

use super::RelayError;

/// Secures `tcp` for `domain`: SNI and certificate check both use the XMPP domain, not the SRV
/// target, as RFC 6120 section 13.7.2 requires.
pub async fn connect(tcp: TcpStream, domain: &str) -> Result<TlsStream<TcpStream>, RelayError> {
    let name = ServerName::try_from(domain.to_owned())
        .map_err(|_| RelayError::StreamError("domain is not a valid server name".into()))?;
    TlsConnector::from(config()?)
        .connect(name, tcp)
        .await
        .map_err(classify)
}

/// The client configuration, built on first use: reading the OS store costs a few milliseconds
/// and never changes while the app runs.
fn config() -> Result<Arc<ClientConfig>, RelayError> {
    static CONFIG: OnceLock<Arc<ClientConfig>> = OnceLock::new();
    if let Some(config) = CONFIG.get() {
        return Ok(config.clone());
    }
    let loaded = rustls_native_certs::load_native_certs();
    let mut roots = RootCertStore::empty();
    let (added, ignored) = roots.add_parsable_certificates(loaded.certs);
    log::debug!(
        "{added} root certificate(s) loaded, {ignored} ignored, {} load error(s)",
        loaded.errors.len()
    );
    if added == 0 {
        // Without roots every certificate would be "invalid"; say what is really wrong.
        return Err(RelayError::StreamError("no root certificate found".into()));
    }
    let config = Arc::new(
        ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    );
    Ok(CONFIG.get_or_init(|| config).clone())
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
    fn any_other_handshake_failure_is_unreachable() {
        let error = classify(io(Error::HandshakeNotComplete));
        assert!(matches!(error, RelayError::ServerUnreachable(_)));
        let error = classify(std::io::Error::from(std::io::ErrorKind::ConnectionReset));
        assert!(matches!(error, RelayError::ServerUnreachable(_)));
    }
}
