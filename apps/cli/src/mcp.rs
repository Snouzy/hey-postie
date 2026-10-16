//! The MCP side: one stateless JSON-RPC request per run (spec 2026-07-28, no session, no
//! initialize), and its answer turned into the CLI's output or error.

use crate::endpoint::Endpoint;
use crate::error::{CliError, Kind};
use crate::http::{self, Failure, Response};
use serde_json::{json, Value};

const PROTOCOL_VERSION: &str = "2026-07-28";

/// Read tools share these verbs (spec 2026-10-16-mcp-design, section 4): anything else changes
/// something, so a lost answer must not be retried blindly.
const READ_VERBS: [&str; 4] = ["list_", "get_", "read_", "find_"];

pub fn is_read(tool: &str) -> bool {
    READ_VERBS.iter().any(|verb| tool.starts_with(verb))
}

/// The JSON-RPC body, with the per-request `_meta` that replaces the initialize handshake.
pub fn request_body(method: &str, params: Value) -> String {
    let mut params = match params {
        Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };
    params.insert(
        "_meta".into(),
        json!({
            "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
            "io.modelcontextprotocol/clientInfo": { "name": "postie", "version": env!("CARGO_PKG_VERSION") },
            "io.modelcontextprotocol/clientCapabilities": {},
        }),
    );
    json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }).to_string()
}

/// The headers spec 2026-07-28 checks against the body.
pub fn headers(method: &str, name: Option<&str>) -> Vec<(&'static str, String)> {
    let mut headers = vec![
        ("Content-Type", "application/json".to_string()),
        ("Accept", "application/json, text/event-stream".to_string()),
        ("MCP-Protocol-Version", PROTOCOL_VERSION.to_string()),
        ("Mcp-Method", method.to_string()),
    ];
    if let Some(name) = name {
        headers.push(("Mcp-Name", name.to_string()));
    }
    headers
}

/// `tools/call`: `{"tool", "text"}`, plus `"data"` when the tool gives structured content.
pub fn call_tool(endpoint: &Endpoint, tool: &str, arguments: Value) -> Result<Value, CliError> {
    let body = request_body(
        "tools/call",
        json!({ "name": tool, "arguments": arguments }),
    );
    let sent = http::post(endpoint, &headers("tools/call", Some(tool)), &body);
    let result = rpc_result(sent, endpoint, !is_read(tool))?;
    tool_output(tool, &result)
}

/// `tools/list`: `{"tools": [{"name", "title", "description", "read_only"}]}`.
pub fn list_tools(endpoint: &Endpoint) -> Result<Value, CliError> {
    let body = request_body("tools/list", json!({}));
    let result = rpc_result(
        http::post(endpoint, &headers("tools/list", None), &body),
        endpoint,
        false,
    )?;
    let tools: Vec<Value> = result["tools"]
        .as_array()
        .map(|tools| {
            tools
                .iter()
                .map(|tool| {
                    json!({
                        "name": tool["name"],
                        "title": tool["title"],
                        "description": tool["description"],
                        "read_only": tool["annotations"]["readOnlyHint"].as_bool().unwrap_or(false),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(json!({ "tools": tools }))
}

/// The JSON-RPC `result`, or the error an agent can act on.
pub fn rpc_result(
    sent: Result<Response, Failure>,
    endpoint: &Endpoint,
    writes: bool,
) -> Result<Value, CliError> {
    let response = sent.map_err(|failure| match failure {
        Failure::Unreachable => CliError::new(
            Kind::Network,
            format!(
                "Nothing answers on {}: Hey Postie is closed or its assistant is off. Ask the user to open it and turn on Settings › Claude.",
                endpoint.url()
            ),
        ),
        Failure::NoAnswer if writes => CliError::new(
            Kind::Network,
            "Hey Postie did not answer. It may have been done: check (for example with `postie messages list`) before trying again.",
        ),
        Failure::NoAnswer => CliError::new(Kind::Network, "Hey Postie did not answer. Try again."),
    })?;
    let message = parse_body(&response);
    let error_text = |fallback: &str| {
        message
            .as_ref()
            .and_then(|value| value["error"]["message"].as_str())
            .unwrap_or(fallback)
            .to_string()
    };
    match response.status {
        401 | 403 => {
            return Err(CliError::new(
                Kind::Auth,
                error_text("The token was refused."),
            ))
        }
        503 => {
            return Err(CliError::new(
                Kind::Network,
                error_text("Hey Postie did not answer."),
            ))
        }
        _ => {}
    }
    let Some(message) = message.as_ref() else {
        return Err(CliError::new(
            Kind::Other,
            format!(
                "Unexpected answer from Hey Postie (HTTP {}).",
                response.status
            ),
        ));
    };
    if let Some(error) = message.get("error") {
        let kind = match error["code"].as_i64() {
            Some(-32602) | Some(-32601) => Kind::Usage,
            _ => Kind::Other,
        };
        return Err(CliError::new(
            kind,
            error_text("Hey Postie refused the request."),
        ));
    }
    Ok(message["result"].clone())
}

/// A JSON body, or the last `data:` event of a stream (older protocol versions answer in SSE).
fn parse_body(response: &Response) -> Option<Value> {
    if response.content_type.starts_with("text/event-stream") {
        return response
            .body
            .lines()
            .rev()
            .filter_map(|line| line.strip_prefix("data:"))
            .find_map(|data| serde_json::from_str(data.trim()).ok());
    }
    serde_json::from_str(&response.body).ok()
}

/// A tool's answer. `isError` is the app refusing (its sentence says what to do next); a refusal
/// of the arguments themselves is a usage error.
pub fn tool_output(tool: &str, result: &Value) -> Result<Value, CliError> {
    let text = result["content"]
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    if result["isError"].as_bool().unwrap_or(false) {
        let kind = if text.contains("Input validation error") || text.contains("-32602") {
            Kind::Usage
        } else {
            Kind::Other
        };
        return Err(CliError::new(kind, text));
    }
    let mut output = json!({ "tool": tool, "text": text });
    if let Some(data) = result.get("structuredContent") {
        output["data"] = data.clone();
    }
    Ok(output)
}

#[cfg(test)]
#[path = "mcp_tests.rs"]
mod tests;
