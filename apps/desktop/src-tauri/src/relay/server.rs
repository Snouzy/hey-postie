//! Accepts local WebSocket connections and checks the token before handing each one to `bridge`.

use std::net::TcpListener as StdListener;
use std::sync::Arc;
use std::time::Duration;

use tokio::net::TcpListener;
use tokio::sync::Semaphore;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;

use super::bridge;

/// One per account would do; a few more cover reloads of the webview while sessions drain.
const MAX_SESSIONS: usize = 8;
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
/// A stanza is small; anything bigger is not a chat message. Same cap as the splitter's.
const MAX_FRAME_BYTES: usize = super::framing::MAX_ELEMENT_BYTES;

pub async fn serve(listener: StdListener, token: String) {
    let listener = match TcpListener::from_std(listener) {
        Ok(listener) => listener,
        Err(error) => {
            log::error!("cannot serve the relay: {}", error.kind());
            return;
        }
    };
    let path = format!("/xmpp/{token}");
    let sessions = Arc::new(Semaphore::new(MAX_SESSIONS));
    loop {
        let (stream, _peer) = match listener.accept().await {
            Ok(accepted) => accepted,
            Err(error) => {
                log::debug!("accept failed: {}", error.kind());
                // Out of file descriptors or similar: spinning would not help.
                tokio::time::sleep(Duration::from_millis(100)).await;
                continue;
            }
        };
        let Ok(permit) = sessions.clone().try_acquire_owned() else {
            log::debug!("too many sessions, dropping a connection");
            continue;
        };
        let path = path.clone();
        tauri::async_runtime::spawn(async move {
            let config = WebSocketConfig::default()
                .max_message_size(Some(MAX_FRAME_BYTES))
                .max_frame_size(Some(MAX_FRAME_BYTES));
            let handshake = tokio_tungstenite::accept_hdr_async_with_config(
                stream,
                check_path(&path),
                Some(config),
            );
            match tokio::time::timeout(HANDSHAKE_TIMEOUT, handshake).await {
                Ok(Ok(ws)) => bridge::run(ws).await,
                Ok(Err(error)) => log::debug!("handshake refused: {error}"),
                Err(_) => log::debug!("handshake timed out"),
            }
            drop(permit);
        });
    }
}

/// Only the webview knows the token; any other path is answered with 404 and dropped.
// The `Result` shape is tungstenite's `Callback` contract; its error type is simply big.
#[allow(clippy::result_large_err)]
fn check_path(
    expected: &str,
) -> impl FnOnce(&Request, Response) -> Result<Response, ErrorResponse> {
    let expected = expected.to_owned();
    move |request, response| {
        if request.uri().path() == expected {
            Ok(response)
        } else {
            let mut refused = ErrorResponse::new(None);
            *refused.status_mut() = StatusCode::NOT_FOUND;
            Err(refused)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(path: &str) -> Request {
        Request::builder().uri(path).body(()).unwrap()
    }

    #[test]
    fn only_the_exact_token_path_is_accepted() {
        let check = check_path("/xmpp/abc");
        assert!(check(&request("/xmpp/abc"), Response::new(())).is_ok());
        for wrong in ["/xmpp/abd", "/xmpp/abc/", "/xmpp/", "/", "/xmpp/ABC"] {
            let refused =
                check_path("/xmpp/abc")(&request(wrong), Response::new(())).expect_err(wrong);
            assert_eq!(refused.status(), StatusCode::NOT_FOUND);
        }
    }

    mod properties {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            #[test]
            fn only_the_exact_token_path_is_ever_accepted(
                token in "[0-9a-f]{64}",
                path in "/[a-zA-Z0-9/._-]{0,80}",
                query in prop::option::of("[a-z=&]{1,10}"),
            ) {
                let expected = format!("/xmpp/{token}");
                let uri = match &query {
                    Some(query) => format!("{path}?{query}"),
                    None => path.clone(),
                };
                let outcome = check_path(&expected)(&request(&uri), Response::new(()));
                prop_assert_eq!(outcome.is_ok(), path == expected, "{}", uri);
            }
        }
    }
}
