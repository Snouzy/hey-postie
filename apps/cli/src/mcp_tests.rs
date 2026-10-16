use super::*;

fn endpoint() -> Endpoint {
    Endpoint {
        host: "127.0.0.1".into(),
        port: 7413,
        path: "/mcp".into(),
        token: "secret".into(),
    }
}

fn json_response(status: u16, body: Value) -> Result<Response, Failure> {
    Ok(Response {
        status,
        content_type: "application/json".into(),
        body: body.to_string(),
    })
}

fn kind_of(sent: Result<Response, Failure>, writes: bool) -> Kind {
    rpc_result(sent, &endpoint(), writes).unwrap_err().kind
}

#[test]
fn the_request_carries_the_stateless_meta() {
    let body: Value = serde_json::from_str(&request_body(
        "tools/call",
        json!({ "name": "list_chats", "arguments": {} }),
    ))
    .unwrap();
    assert_eq!(body["method"], "tools/call");
    assert_eq!(body["params"]["name"], "list_chats");
    assert_eq!(
        body["params"]["_meta"]["io.modelcontextprotocol/protocolVersion"],
        PROTOCOL_VERSION
    );
    let named = headers("tools/call", Some("list_chats"));
    assert!(named.contains(&("Mcp-Name", "list_chats".to_string())));
    assert!(!headers("tools/list", None)
        .iter()
        .any(|(name, _)| *name == "Mcp-Name"));
}

#[test]
fn tells_reads_from_writes_by_their_verb() {
    for tool in ["list_chats", "get_chat", "read_messages", "find_contacts"] {
        assert!(is_read(tool), "{tool}");
    }
    for tool in [
        "send_message",
        "draft_message",
        "mark_chat_read",
        "set_presence",
    ] {
        assert!(!is_read(tool), "{tool}");
    }
}

#[test]
fn maps_transport_and_http_failures_to_exit_codes() {
    assert_eq!(kind_of(Err(Failure::Unreachable), false), Kind::Network);
    assert_eq!(kind_of(json_response(401, json!({})), false), Kind::Auth);
    assert_eq!(kind_of(json_response(403, json!({})), false), Kind::Auth);
    assert_eq!(kind_of(json_response(503, json!({})), false), Kind::Network);
    let invalid =
        json!({ "jsonrpc": "2.0", "id": 1, "error": { "code": -32602, "message": "bad" } });
    assert_eq!(kind_of(json_response(200, invalid), false), Kind::Usage);
    let other = json!({ "jsonrpc": "2.0", "id": 1, "error": { "code": -32603, "message": "x" } });
    assert_eq!(kind_of(json_response(500, other), false), Kind::Other);
    assert_eq!(
        kind_of(
            Ok(Response {
                status: 502,
                content_type: "text/plain".into(),
                body: "bad gateway".into()
            }),
            false
        ),
        Kind::Other
    );
}

#[test]
fn a_lost_answer_to_a_write_says_it_may_have_happened() {
    let error = rpc_result(Err(Failure::NoAnswer), &endpoint(), true).unwrap_err();
    assert!(error.message.contains("may have been done"));
    let error = rpc_result(Err(Failure::NoAnswer), &endpoint(), false).unwrap_err();
    assert!(!error.message.contains("may have been done"));
}

#[test]
fn reads_the_app_s_error_sentence_but_never_the_token() {
    let refused = json!({ "jsonrpc": "2.0", "error": { "code": -32000, "message": "Missing or wrong token." }, "id": null });
    let error = rpc_result(json_response(401, refused), &endpoint(), false).unwrap_err();
    assert_eq!(error.message, "Missing or wrong token.");
    let error = rpc_result(Err(Failure::Unreachable), &endpoint(), false).unwrap_err();
    assert!(!error.message.contains("secret"));
}

#[test]
fn reads_an_sse_answer() {
    let sent = Ok(Response {
        status: 200,
        content_type: "text/event-stream".into(),
        body: "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"tools\":[]}}\n\n"
            .into(),
    });
    assert_eq!(
        rpc_result(sent, &endpoint(), false),
        Ok(json!({ "tools": [] }))
    );
}

#[test]
fn shapes_a_tool_answer() {
    let result = json!({ "content": [{ "type": "text", "text": "2 chats:\nBob" }] });
    assert_eq!(
        tool_output("list_chats", &result),
        Ok(json!({ "tool": "list_chats", "text": "2 chats:\nBob" }))
    );
    let structured =
        json!({ "content": [{ "type": "text", "text": "ok" }], "structuredContent": { "n": 1 } });
    assert_eq!(
        tool_output("x", &structured).unwrap()["data"],
        json!({ "n": 1 })
    );
}

#[test]
fn a_refusal_by_the_app_is_exit_4_with_its_sentence() {
    let refusal = json!({ "content": [{ "type": "text", "text": "Direct sending is off in Hey Postie." }], "isError": true });
    let error = tool_output("send_message", &refusal).unwrap_err();
    assert_eq!(
        (error.exit_code(), error.message.as_str()),
        (4, "Direct sending is off in Hey Postie.")
    );
    let invalid = json!({ "content": [{ "type": "text", "text": "Input validation error: limit too big" }], "isError": true });
    assert_eq!(
        tool_output("read_messages", &invalid)
            .unwrap_err()
            .exit_code(),
        1
    );
}
