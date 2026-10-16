//! What a request must show before it reaches the webview. Pure functions, tested below: the
//! listener is the only guard of the MCP endpoint (a browser `Request` cannot carry `Host` or
//! `Origin`, so the webview cannot check them; spec 2026-10-16-mcp-design, section 9).

use subtle::ConstantTimeEq;

/// The largest body accepted. MCP requests are small JSON-RPC messages.
pub const MAX_BODY_BYTES: u64 = 1024 * 1024;

/// Why a request is turned away: the HTTP status and a sentence for the client (no secret in it).
#[derive(Debug, PartialEq, Eq)]
pub struct Rejection {
    pub status: u16,
    pub message: &'static str,
}

const fn reject(status: u16, message: &'static str) -> Rejection {
    Rejection { status, message }
}

/// The parts of a request the guard reads.
pub struct Incoming<'a> {
    pub method: &'a str,
    pub path: &'a str,
    pub host: Option<&'a str>,
    pub origin: Option<&'a str>,
    pub authorization: Option<&'a str>,
    pub content_length: Option<u64>,
}

/// Checks a request against the listener's port and token. Order: what a stray client gets
/// wrong first (path, method), then what an attacker would try (Host for DNS rebinding, Origin
/// for a web page, the token), then the size.
pub fn check(request: &Incoming, port: u16, token: &str) -> Result<(), Rejection> {
    if request.path != "/mcp" {
        return Err(reject(404, "The Hey Postie MCP endpoint is /mcp."));
    }
    if request.method != "POST" {
        return Err(reject(405, "Only POST is served."));
    }
    let allowed_host =
        |host: &str| host == format!("127.0.0.1:{port}") || host == format!("localhost:{port}");
    if !request.host.is_some_and(allowed_host) {
        return Err(reject(403, "Unexpected Host."));
    }
    // No web page may call this endpoint: a request that carries an Origin comes from a browser.
    if request.origin.is_some() {
        return Err(reject(403, "Requests from web pages are refused."));
    }
    let given = request
        .authorization
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or("");
    if given.is_empty() || !bool::from(given.as_bytes().ct_eq(token.as_bytes())) {
        return Err(reject(
            401,
            "Missing or wrong token. Copy it again from Hey Postie's settings.",
        ));
    }
    match request.content_length {
        None => Err(reject(411, "Content-Length is required.")),
        Some(length) if length > MAX_BODY_BYTES => Err(reject(413, "The request is too large.")),
        Some(_) => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PORT: u16 = 7413;
    const TOKEN: &str = "secret-token";

    fn good() -> Incoming<'static> {
        Incoming {
            method: "POST",
            path: "/mcp",
            host: Some("127.0.0.1:7413"),
            origin: None,
            authorization: Some("Bearer secret-token"),
            content_length: Some(120),
        }
    }

    fn status(request: &Incoming) -> u16 {
        check(request, PORT, TOKEN)
            .err()
            .map_or(200, |rejection| rejection.status)
    }

    #[test]
    fn lets_a_well_formed_request_through() {
        assert_eq!(check(&good(), PORT, TOKEN), Ok(()));
        assert_eq!(
            status(&Incoming {
                host: Some("localhost:7413"),
                ..good()
            }),
            200
        );
    }

    #[test]
    fn serves_only_post_on_mcp() {
        assert_eq!(
            status(&Incoming {
                path: "/",
                ..good()
            }),
            404
        );
        assert_eq!(
            status(&Incoming {
                method: "GET",
                ..good()
            }),
            405
        );
    }

    #[test]
    fn refuses_another_host_against_dns_rebinding() {
        assert_eq!(
            status(&Incoming {
                host: Some("evil.example:7413"),
                ..good()
            }),
            403
        );
        assert_eq!(
            status(&Incoming {
                host: Some("127.0.0.1:9999"),
                ..good()
            }),
            403
        );
        assert_eq!(
            status(&Incoming {
                host: None,
                ..good()
            }),
            403
        );
    }

    #[test]
    fn refuses_any_web_page() {
        assert_eq!(
            status(&Incoming {
                origin: Some("http://127.0.0.1:7413"),
                ..good()
            }),
            403
        );
        assert_eq!(
            status(&Incoming {
                origin: Some("null"),
                ..good()
            }),
            403
        );
    }

    #[test]
    fn needs_the_exact_token() {
        assert_eq!(
            status(&Incoming {
                authorization: None,
                ..good()
            }),
            401
        );
        assert_eq!(
            status(&Incoming {
                authorization: Some("Bearer wrong"),
                ..good()
            }),
            401
        );
        assert_eq!(
            status(&Incoming {
                authorization: Some("secret-token"),
                ..good()
            }),
            401
        );
        assert_eq!(
            status(&Incoming {
                authorization: Some("Bearer "),
                ..good()
            }),
            401
        );
    }

    #[test]
    fn caps_the_body() {
        assert_eq!(
            status(&Incoming {
                content_length: None,
                ..good()
            }),
            411
        );
        assert_eq!(
            status(&Incoming {
                content_length: Some(MAX_BODY_BYTES + 1),
                ..good()
            }),
            413
        );
    }

    #[test]
    fn rejections_never_echo_the_token() {
        let rejection = check(
            &Incoming {
                authorization: Some("Bearer wrong"),
                ..good()
            },
            PORT,
            TOKEN,
        );
        assert!(!rejection.unwrap_err().message.contains(TOKEN));
    }
}
