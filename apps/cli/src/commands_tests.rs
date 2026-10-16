use super::*;
use serde_json::json;

fn args(line: &str) -> Vec<String> {
    line.split_whitespace().map(String::from).collect()
}

fn no_stdin() -> Result<String, CliError> {
    panic!("stdin was not expected")
}

fn parse_line(line: &str) -> Result<Action, CliError> {
    parse(&args(line), &mut no_stdin)
}

fn call(tool: &str, arguments: Value) -> Action {
    Action::Call {
        tool: tool.into(),
        arguments,
    }
}

#[test]
fn every_tool_of_the_app_has_one_command() {
    let mut tools: Vec<&str> = COMMANDS.iter().map(|command| command.tool).collect();
    tools.sort_unstable();
    tools.dedup();
    assert_eq!(tools.len(), 12);
    assert_eq!(COMMANDS.len(), 12);
}

#[test]
fn maps_commands_to_tool_calls() {
    let cases = [
        ("chats list", call("list_chats", json!({}))),
        (
            "chats list --unread --kind hall",
            call("list_chats", json!({ "unread_only": true, "kind": "hall" })),
        ),
        (
            "chats get bob@x.org",
            call("get_chat", json!({ "chat": "bob@x.org" })),
        ),
        (
            "chats mark-read Bob",
            call("mark_chat_read", json!({ "chat": "Bob" })),
        ),
        (
            "messages list bob@x.org --limit 5 --before m-1",
            call(
                "read_messages",
                json!({ "chat": "bob@x.org", "limit": 5, "before": "m-1" }),
            ),
        ),
        (
            "messages list bob@x.org --limit=5",
            call("read_messages", json!({ "chat": "bob@x.org", "limit": 5 })),
        ),
        (
            "messages draft bob@x.org --text hello",
            call(
                "draft_message",
                json!({ "chat": "bob@x.org", "text": "hello" }),
            ),
        ),
        (
            "messages send bob@x.org --text hello",
            call(
                "send_message",
                json!({ "chat": "bob@x.org", "text": "hello" }),
            ),
        ),
        (
            "messages edit bob@x.org m-1 --text fixed",
            call(
                "edit_message",
                json!({ "chat": "bob@x.org", "message_id": "m-1", "text": "fixed" }),
            ),
        ),
        (
            "messages retract bob@x.org m-1",
            call(
                "retract_message",
                json!({ "chat": "bob@x.org", "message_id": "m-1" }),
            ),
        ),
        (
            "messages hide bob@x.org m-1",
            call(
                "hide_message",
                json!({ "chat": "bob@x.org", "message_id": "m-1" }),
            ),
        ),
        (
            "messages react bob@x.org m-1 --emoji 👍",
            call(
                "react_to_message",
                json!({ "chat": "bob@x.org", "message_id": "m-1", "emoji": "👍" }),
            ),
        ),
        (
            "contacts find ali",
            call("find_contacts", json!({ "query": "ali" })),
        ),
        (
            "presence set away --status lunch",
            call("set_presence", json!({ "show": "away", "status": "lunch" })),
        ),
        ("tools", Action::ListTools),
        ("call list_chats", call("list_chats", json!({}))),
    ];
    for (line, expected) in cases {
        assert_eq!(parse_line(line), Ok(expected), "{line}");
    }
}

#[test]
fn keeps_a_text_with_spaces_and_json_arguments_whole() {
    let line = ["messages", "draft", "bob@x.org", "--text", "See you at 6"].map(String::from);
    assert_eq!(
        parse(&line, &mut no_stdin),
        Ok(call(
            "draft_message",
            json!({ "chat": "bob@x.org", "text": "See you at 6" })
        ))
    );
    let line = [
        "call",
        "read_messages",
        r#"{"chat": "bob@x.org", "limit": 2}"#,
    ]
    .map(String::from);
    assert_eq!(
        parse(&line, &mut no_stdin),
        Ok(call(
            "read_messages",
            json!({ "chat": "bob@x.org", "limit": 2 })
        ))
    );
}

#[test]
fn reads_a_dash_from_stdin() {
    let mut stdin = || Ok("from stdin".to_string());
    assert_eq!(
        parse(&args("messages send bob@x.org --text -"), &mut stdin),
        Ok(call(
            "send_message",
            json!({ "chat": "bob@x.org", "text": "from stdin" })
        ))
    );
    let mut stdin = || Ok(r#"{"query": "ali"}"#.to_string());
    assert_eq!(
        parse(&args("call find_contacts -"), &mut stdin),
        Ok(call("find_contacts", json!({ "query": "ali" })))
    );
}

#[test]
fn helps_at_every_level() {
    let Ok(Action::Help(tree)) = parse_line("--help") else {
        panic!("no help")
    };
    for command in COMMANDS {
        assert!(tree.contains(&format!("{} {}", command.group, command.name)));
    }
    assert!(matches!(parse_line(""), Ok(Action::Help(_))));
    assert!(matches!(parse_line("chats"), Ok(Action::Help(text)) if text.contains("mark-read")));
    assert!(matches!(
        parse_line("messages send --help"),
        Ok(Action::Help(text)) if text.contains("postie messages send <chat> --text <text>")
    ));
    assert!(matches!(
        parse_line("messages list -h"),
        Ok(Action::Help(text)) if text.contains("[--limit <n>]") && text.contains("read_messages")
    ));
    assert!(matches!(parse_line("tools --help"), Ok(Action::Help(_))));
    assert!(matches!(parse_line("call --help"), Ok(Action::Help(_))));
}

#[test]
fn refuses_bad_input_with_exit_code_1() {
    for line in [
        "nope",
        "chats nope",
        "chats get",
        "chats get a b",
        "messages draft bob@x.org",
        "messages draft bob@x.org --text",
        "messages list bob@x.org --limit five",
        "chats list --unread=yes",
        "chats list --wat",
        "tools extra",
        "call",
        "call list_chats [1]",
        "call list_chats nope",
    ] {
        let error = parse_line(line).unwrap_err();
        assert_eq!(error.exit_code(), 1, "{line}");
    }
    assert!(parse_line("messages draft bob@x.org")
        .unwrap_err()
        .message
        .contains("Missing `--text`"));
}
