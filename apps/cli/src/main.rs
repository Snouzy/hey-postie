//! `postie`: Hey Postie for AI agents (spec wiki/specs/2026-10-17-agent-cli-design.md). A thin
//! client of the app's local MCP endpoint: one command, one tool call, JSON out.

mod commands;
mod endpoint;
mod error;
mod help;
mod http;
mod mcp;

use commands::Action;
use error::CliError;
use std::io::Read;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let env = |name: &str| std::env::var(name).ok();
    match run(&args, &mut read_stdin_once(), &env) {
        Ok(Output::Text(text)) => println!("{text}"),
        Ok(Output::Json(value)) => println!("{value}"),
        Err(error) => {
            eprintln!("{}", error.to_json());
            std::process::exit(error.exit_code());
        }
    }
}

#[derive(Debug)]
enum Output {
    Text(String),
    Json(serde_json::Value),
}

fn run(args: &[String], stdin: commands::Stdin, env: endpoint::Env) -> Result<Output, CliError> {
    match commands::parse(args, stdin)? {
        Action::Help(text) => Ok(Output::Text(text)),
        Action::ListTools => mcp::list_tools(&endpoint::locate(env)?).map(Output::Json),
        Action::Call { tool, arguments } => {
            mcp::call_tool(&endpoint::locate(env)?, &tool, arguments).map(Output::Json)
        }
    }
}

/// Stdin for an option's `-`: read once; a second `-` in the same command is a mistake.
fn read_stdin_once() -> impl FnMut() -> Result<String, CliError> {
    let mut used = false;
    move || {
        if std::mem::replace(&mut used, true) {
            return Err(CliError::usage("Only one value can come from stdin (`-`)."));
        }
        let mut text = String::new();
        std::io::stdin()
            .read_to_string(&mut text)
            .map_err(|_| CliError::usage("Stdin is not readable text."))?;
        Ok(text.trim_end_matches(['\n', '\r']).to_string())
    }
}

#[cfg(test)]
#[path = "main_tests.rs"]
mod tests;
