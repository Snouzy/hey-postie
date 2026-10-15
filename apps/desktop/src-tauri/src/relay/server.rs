//! Accepts local WebSocket connections and checks the token before handing each one to `bridge`.

use std::net::TcpListener as StdListener;

use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;

use super::bridge;

pub async fn serve(listener: StdListener, token: String) {
    let listener = match TcpListener::from_std(listener) {
        Ok(listener) => listener,
        Err(error) => {
            log::error!("cannot serve the relay: {}", error.kind());
            return;
        }
    };
    let path = format!("/xmpp/{token}");
    loop {
        match listener.accept().await {
            Ok((stream, _peer)) => {
                let path = path.clone();
                tauri::async_runtime::spawn(async move {
                    match tokio_tungstenite::accept_hdr_async(stream, check_path(&path)).await {
                        Ok(ws) => bridge::run(ws).await,
                        Err(error) => log::debug!("handshake refused: {error}"),
                    }
                });
            }
            Err(error) => log::debug!("accept failed: {}", error.kind()),
        }
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
}
