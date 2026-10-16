//! The commands: one table, each row one MCP tool of the app (`packages/mcp/src/tools/`). The CLI
//! knows the tool and argument names only; the app checks the values and the permissions.

use crate::error::CliError;
use crate::help;
use serde_json::{Map, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Text,
    Number,
    /// An option without a value: present means `true`.
    Switch,
}

/// One argument: a positional (`chat`) or an option (`limit`, written `--limit`).
pub struct Param {
    pub name: &'static str,
    /// The tool's argument it fills.
    pub key: &'static str,
    pub kind: Kind,
    pub required: bool,
    pub help: &'static str,
}

pub struct Command {
    pub group: &'static str,
    pub name: &'static str,
    pub tool: &'static str,
    pub summary: &'static str,
    pub positionals: &'static [Param],
    pub options: &'static [Param],
    pub example: &'static str,
}

const fn positional(name: &'static str, key: &'static str, help: &'static str) -> Param {
    Param {
        name,
        key,
        kind: Kind::Text,
        required: true,
        help,
    }
}

const fn option(name: &'static str, key: &'static str, kind: Kind, help: &'static str) -> Param {
    Param {
        name,
        key,
        kind,
        required: false,
        help,
    }
}

const fn needed(name: &'static str, key: &'static str, help: &'static str) -> Param {
    Param {
        name,
        key,
        kind: Kind::Text,
        required: true,
        help,
    }
}

const CHAT: Param = positional("chat", "chat", "The chat JID, or its exact name");
const TARGET: Param = positional(
    "chat",
    "chat",
    "The chat JID, its exact name, or a contact's JID",
);
const MESSAGE: Param = positional(
    "message-id",
    "message_id",
    "The id at the start of a `messages list` line",
);
const TEXT: Param = needed("text", "text", "The text; `-` reads it from stdin");

pub static COMMANDS: &[Command] = &[
    Command {
        group: "chats",
        name: "list",
        tool: "list_chats",
        summary: "Chats and halls by last activity, with unread counts",
        positionals: &[],
        options: &[
            option(
                "unread",
                "unread_only",
                Kind::Switch,
                "Only chats with unread messages",
            ),
            option("kind", "kind", Kind::Text, "`direct` or `hall`"),
        ],
        example: "postie chats list --unread",
    },
    Command {
        group: "chats",
        name: "get",
        tool: "get_chat",
        summary: "One chat: its peer and presence, or a hall's topic and members",
        positionals: &[CHAT],
        options: &[],
        example: "postie chats get alice@example.org",
    },
    Command {
        group: "chats",
        name: "mark-read",
        tool: "mark_chat_read",
        summary: "Mark every message of a chat as read",
        positionals: &[CHAT],
        options: &[],
        example: "postie chats mark-read alice@example.org",
    },
    Command {
        group: "messages",
        name: "list",
        tool: "read_messages",
        summary: "Messages of a chat, oldest first; does not mark them read",
        positionals: &[CHAT],
        options: &[
            option(
                "limit",
                "limit",
                Kind::Number,
                "How many, 1 to 50 (default 30)",
            ),
            option(
                "before",
                "before",
                Kind::Text,
                "A message id: the page just before it",
            ),
        ],
        example: "postie messages list alice@example.org --limit 10",
    },
    Command {
        group: "messages",
        name: "draft",
        tool: "draft_message",
        summary: "Put a text in a chat's composer; the user edits and sends it",
        positionals: &[TARGET],
        options: &[TEXT],
        example: "postie messages draft alice@example.org --text \"See you at 6\"",
    },
    Command {
        group: "messages",
        name: "send",
        tool: "send_message",
        summary: "Send a text at once (highest level only; ask the user first)",
        positionals: &[TARGET],
        options: &[TEXT],
        example: "postie messages send alice@example.org --text - < reply.txt",
    },
    Command {
        group: "messages",
        name: "edit",
        tool: "edit_message",
        summary: "Correct one of the user's sent messages (highest level only)",
        positionals: &[CHAT, MESSAGE],
        options: &[TEXT],
        example: "postie messages edit alice@example.org m-7Hc2 --text \"See you at 7\"",
    },
    Command {
        group: "messages",
        name: "retract",
        tool: "retract_message",
        summary: "Delete one of the user's sent messages for everyone (highest level only)",
        positionals: &[CHAT, MESSAGE],
        options: &[],
        example: "postie messages retract alice@example.org m-7Hc2",
    },
    Command {
        group: "messages",
        name: "hide",
        tool: "hide_message",
        summary: "Hide a message on this device only; nothing is sent",
        positionals: &[CHAT, MESSAGE],
        options: &[],
        example: "postie messages hide alice@example.org m-7Hc2",
    },
    Command {
        group: "messages",
        name: "react",
        tool: "react_to_message",
        summary: "Add one emoji reaction, or remove it if already there",
        positionals: &[CHAT, MESSAGE],
        options: &[needed("emoji", "emoji", "One emoji")],
        example: "postie messages react alice@example.org m-7Hc2 --emoji 👍",
    },
    Command {
        group: "contacts",
        name: "find",
        tool: "find_contacts",
        summary: "Contacts whose name or JID contains the query, with presence",
        positionals: &[positional("query", "query", "Part of a name or a JID")],
        options: &[],
        example: "postie contacts find ali",
    },
    Command {
        group: "presence",
        name: "set",
        tool: "set_presence",
        summary: "Show as online, away or dnd, with an optional status",
        positionals: &[positional("show", "show", "`online`, `away` or `dnd`")],
        options: &[option(
            "status",
            "status",
            Kind::Text,
            "A status sentence, 140 characters at most",
        )],
        example: "postie presence set away --status \"Back at 2\"",
    },
];

/// What the command line asks for.
#[derive(Debug, PartialEq)]
pub enum Action {
    Help(String),
    ListTools,
    Call { tool: String, arguments: Value },
}

/// Reads stdin, at most once per run (an option's value `-`).
pub type Stdin<'a> = &'a mut dyn FnMut() -> Result<String, CliError>;

fn wants_help(args: &[String]) -> bool {
    args.iter().any(|arg| arg == "--help" || arg == "-h")
}

pub fn parse(args: &[String], stdin: Stdin) -> Result<Action, CliError> {
    let Some(first) = args.first() else {
        return Ok(Action::Help(help::tree()));
    };
    match first.as_str() {
        "--help" | "-h" | "help" => Ok(Action::Help(help::tree())),
        "tools" if wants_help(args) => Ok(Action::Help(help::tools())),
        "tools" if args.len() == 1 => Ok(Action::ListTools),
        "tools" => Err(CliError::usage("`postie tools` takes no argument.")),
        "call" if wants_help(args) => Ok(Action::Help(help::call())),
        "call" => parse_call(&args[1..], stdin),
        group => parse_command(group, &args[1..], stdin),
    }
}

fn parse_call(args: &[String], stdin: Stdin) -> Result<Action, CliError> {
    let (tool, json) = match args {
        [tool] => (tool, "{}".to_string()),
        [tool, json] if json == "-" => (tool, stdin()?),
        [tool, json] => (tool, json.clone()),
        _ => return Err(CliError::usage("Usage: postie call <tool> [<json> | -]")),
    };
    let arguments: Value = serde_json::from_str(&json)
        .map_err(|_| CliError::usage("The arguments must be a JSON object."))?;
    if !arguments.is_object() {
        return Err(CliError::usage("The arguments must be a JSON object."));
    }
    Ok(Action::Call {
        tool: tool.clone(),
        arguments,
    })
}

fn parse_command(group: &str, args: &[String], stdin: Stdin) -> Result<Action, CliError> {
    if !COMMANDS.iter().any(|command| command.group == group) {
        return Err(CliError::usage(format!(
            "Unknown command `{group}`. Run `postie --help`."
        )));
    }
    let Some(name) = args.first().filter(|name| !name.starts_with('-')) else {
        return Ok(Action::Help(help::group(group)));
    };
    let Some(command) = COMMANDS
        .iter()
        .find(|command| command.group == group && command.name == name)
    else {
        return Err(CliError::usage(format!(
            "Unknown command `{group} {name}`. Run `postie {group} --help`."
        )));
    };
    if wants_help(args) {
        return Ok(Action::Help(help::command(command)));
    }
    let arguments = parse_arguments(command, &args[1..], stdin)?;
    Ok(Action::Call {
        tool: command.tool.to_string(),
        arguments,
    })
}

fn parse_arguments(command: &Command, args: &[String], stdin: Stdin) -> Result<Value, CliError> {
    let usage = |message: String| {
        CliError::usage(format!(
            "{message} Run `postie {} {} --help`.",
            command.group, command.name
        ))
    };
    let mut values = Map::new();
    let mut positionals = command.positionals.iter();
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        let Some(flag) = arg.strip_prefix("--") else {
            let Some(param) = positionals.next() else {
                return Err(usage(format!("Unexpected argument `{arg}`.")));
            };
            values.insert(param.key.into(), Value::String(arg.clone()));
            continue;
        };
        let (name, inline) = match flag.split_once('=') {
            Some((name, value)) => (name, Some(value.to_string())),
            None => (flag, None),
        };
        let Some(param) = command.options.iter().find(|param| param.name == name) else {
            return Err(usage(format!("Unknown option `--{name}`.")));
        };
        if param.kind == Kind::Switch {
            if inline.is_some() {
                return Err(usage(format!("`--{name}` takes no value.")));
            }
            values.insert(param.key.into(), Value::Bool(true));
            continue;
        }
        let Some(raw) = inline.or_else(|| rest.next().cloned()) else {
            return Err(usage(format!("`--{name}` needs a value.")));
        };
        let value = match param.kind {
            Kind::Number => raw
                .parse::<i64>()
                .map(Value::from)
                .map_err(|_| usage(format!("`--{name}` takes a whole number.")))?,
            _ if raw == "-" => Value::String(stdin()?),
            _ => Value::String(raw),
        };
        values.insert(param.key.into(), value);
    }
    if let Some(missing) = positionals.next() {
        return Err(usage(format!("Missing <{}>.", missing.name)));
    }
    if let Some(missing) = command
        .options
        .iter()
        .find(|param| param.required && !values.contains_key(param.key))
    {
        return Err(usage(format!("Missing `--{}`.", missing.name)));
    }
    Ok(Value::Object(values))
}

#[cfg(test)]
#[path = "commands_tests.rs"]
mod tests;
