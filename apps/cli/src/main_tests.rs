//! The whole run against a fake endpoint: a loopback listener that records the request and sends
//! back a canned answer, the way the app's listener answers (`src-tauri/src/mcp/server.rs`).

use super::*;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::mpsc;

/// Serves one request with `status` and `body`; hands back the request's head and body.
fn fake_endpoint(status: u16, body: Value) -> (u16, mpsc::Receiver<(String, String)>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (seen, received) = mpsc::channel();
    std::thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let mut reader = BufReader::new(stream);
        let mut head = String::new();
        let mut length = 0;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse().unwrap();
            }
            if line == "\r\n" {
                break;
            }
            head.push_str(&line);
        }
        let mut request = vec![0; length];
        std::io::Read::read_exact(&mut reader, &mut request).unwrap();
        let body = body.to_string();
        let answer = format!(
            "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{body}",
            body.len()
        );
        reader.get_mut().write_all(answer.as_bytes()).unwrap();
        seen.send((head, String::from_utf8(request).unwrap()))
            .unwrap();
    });
    (port, received)
}

fn run_line(line: &[&str], port: u16) -> Result<Output, CliError> {
    let args: Vec<String> = line.iter().map(|arg| arg.to_string()).collect();
    let url = format!("http://127.0.0.1:{port}/mcp");
    let env = move |name: &str| match name {
        "POSTIE_MCP_TOKEN" => Some("test-token".to_string()),
        "POSTIE_MCP_URL" => Some(url.clone()),
        _ => None,
    };
    run(&args, &mut || Ok("from stdin".to_string()), &env)
}

fn answer(text: &str, is_error: bool) -> Value {
    json!({ "jsonrpc": "2.0", "id": 1, "result": { "content": [{ "type": "text", "text": text }], "isError": is_error } })
}

#[test]
fn a_command_becomes_one_authenticated_tool_call() {
    let (port, received) = fake_endpoint(200, answer("Put in the composer of Bob.", false));
    let output = run_line(&["messages", "draft", "bob@x.org", "--text", "-"], port).unwrap();
    let Output::Json(output) = output else {
        panic!("not JSON")
    };
    assert_eq!(
        output,
        json!({ "tool": "draft_message", "text": "Put in the composer of Bob." })
    );
    let (head, body) = received.recv().unwrap();
    assert!(head.starts_with("POST /mcp HTTP/1.1\r\n"));
    assert!(head.contains(&format!("Host: 127.0.0.1:{port}\r\n")));
    assert!(head.contains("Authorization: Bearer test-token\r\n"));
    assert!(head.contains("Mcp-Name: draft_message\r\n"));
    let body: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(
        body["params"]["arguments"],
        json!({ "chat": "bob@x.org", "text": "from stdin" })
    );
}

#[test]
fn a_refusal_by_the_app_is_exit_4() {
    let (port, _) = fake_endpoint(200, answer("Direct sending is off in Hey Postie.", true));
    let error = run_line(&["messages", "send", "bob@x.org", "--text", "hi"], port).unwrap_err();
    assert_eq!(error.exit_code(), 4);
    assert_eq!(error.message, "Direct sending is off in Hey Postie.");
}

#[test]
fn a_wrong_token_is_exit_3() {
    let refused = json!({ "jsonrpc": "2.0", "error": { "code": -32000, "message": "Missing or wrong token." }, "id": null });
    let (port, _) = fake_endpoint(401, refused);
    assert_eq!(
        run_line(&["chats", "list"], port).unwrap_err().exit_code(),
        3
    );
}

#[test]
fn a_closed_app_is_exit_2() {
    let port = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let error = run_line(&["chats", "list"], port).unwrap_err();
    assert_eq!(error.exit_code(), 2);
    assert!(!error.message.contains("test-token"));
}

#[test]
fn help_needs_no_app() {
    assert!(matches!(run_line(&["--help"], 1), Ok(Output::Text(_))));
}
