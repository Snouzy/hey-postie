//! `--help` texts, written from the command table so they never drift from it.

use crate::commands::{Command, Kind, Param, COMMANDS};

const HEAD: &str = "postie: Hey Postie for AI agents. JSON on stdout, JSON errors on stderr.
It talks to the running Hey Postie app through its local MCP endpoint: the app must be open,
signed in, and Settings › Claude must not be Off. What an agent may do is set there.";

const FOOT: &str =
    "Exit codes: 0 ok, 1 usage, 2 network (app closed or assistant off), 3 auth (token refused),
4 other (refused by the app: the message says what to do).
Endpoint: read from the file the app writes, or POSTIE_MCP_TOKEN with POSTIE_MCP_URL.";

const TOOLS: (&str, &str) = (
    "tools",
    "The app's tools (name, description); also checks the app is on",
);
const CALL: (&str, &str) = (
    "call <tool> [<json> | -]",
    "Call any tool with JSON arguments",
);

fn line(name: &str, summary: &str) -> String {
    format!("  {name:<28} {summary}")
}

/// The whole surface at once, so an agent needs one call to see every command.
pub fn tree() -> String {
    let mut lines = vec![HEAD.to_string(), String::new(), "Commands:".to_string()];
    for command in COMMANDS {
        lines.push(line(
            &format!("{} {}", command.group, command.name),
            command.summary,
        ));
    }
    lines.push(line(TOOLS.0, TOOLS.1));
    lines.push(line(CALL.0, CALL.1));
    lines.push(String::new());
    lines.push("Run `postie <group> <command> --help` for its arguments.".to_string());
    lines.push(FOOT.to_string());
    lines.join("\n")
}

pub fn group(group: &str) -> String {
    let mut lines = vec![format!("postie {group}:")];
    for command in COMMANDS.iter().filter(|command| command.group == group) {
        lines.push(line(command.name, command.summary));
    }
    lines.join("\n")
}

fn placeholder(param: &Param) -> String {
    match param.kind {
        Kind::Switch => format!("--{}", param.name),
        Kind::Number => format!("--{} <n>", param.name),
        Kind::Text => format!("--{} <{}>", param.name, param.name),
    }
}

pub fn command(command: &Command) -> String {
    let mut usage = format!("postie {} {}", command.group, command.name);
    for param in command.positionals {
        usage.push_str(&format!(" <{}>", param.name));
    }
    for param in command.options {
        let shown = placeholder(param);
        usage.push(' ');
        usage.push_str(&if param.required {
            shown
        } else {
            format!("[{shown}]")
        });
    }
    let mut lines = vec![usage, String::new(), format!("{}.", command.summary)];
    if !command.positionals.is_empty() {
        lines.push(String::new());
        lines.push("Arguments:".to_string());
        for param in command.positionals {
            lines.push(line(&format!("<{}>", param.name), param.help));
        }
    }
    if !command.options.is_empty() {
        lines.push(String::new());
        lines.push("Options:".to_string());
        for param in command.options {
            lines.push(line(&placeholder(param), param.help));
        }
    }
    lines.push(String::new());
    lines.push(format!(
        "Calls the app's `{}` tool. Output: {{\"tool\", \"text\"}}.",
        command.tool
    ));
    lines.push(format!("Example: {}", command.example));
    lines.join("\n")
}

pub fn tools() -> String {
    format!(
        "postie tools\n\n{}.\nOutput: {{\"tools\": [{{\"name\", \"title\", \"description\", \"read_only\"}}]}}.",
        TOOLS.1
    )
}

pub fn call() -> String {
    format!(
        "postie {}\n\n{}: the tool's name as `postie tools` lists it, its arguments as one JSON\nobject (`-` reads it from stdin, none means {{}}).\nOutput: {{\"tool\", \"text\"}}.\nExample: postie call read_messages '{{\"chat\": \"alice@example.org\", \"limit\": 5}}'",
        CALL.0, CALL.1
    )
}
