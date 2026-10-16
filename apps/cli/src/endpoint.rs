//! Where the app listens and with which token: `POSTIE_MCP_TOKEN` (with `POSTIE_MCP_URL`), else
//! the file the app writes while its assistant is on (`src-tauri/src/mcp/discovery.rs`). The token
//! is never printed, and never sent anywhere but the loopback interface.

use crate::error::{CliError, Kind};
use std::path::PathBuf;

const IDENTIFIER: &str = "com.snouzylabs.heypostie";
const FILE_NAME: &str = "mcp-endpoint.json";
const DEFAULT_URL: &str = "http://127.0.0.1:7413/mcp";

#[derive(Debug, PartialEq, Eq)]
pub struct Endpoint {
    pub host: String,
    pub port: u16,
    pub path: String,
    pub token: String,
}

impl Endpoint {
    pub fn url(&self) -> String {
        format!("http://{}:{}{}", self.host, self.port, self.path)
    }
}

/// Reads an environment variable; a parameter so tests do not touch the process environment.
pub type Env<'a> = &'a dyn Fn(&str) -> Option<String>;

pub fn locate(env: Env) -> Result<Endpoint, CliError> {
    let set = |name: &str| env(name).filter(|value| !value.is_empty());
    if let Some(token) = set("POSTIE_MCP_TOKEN") {
        let url = set("POSTIE_MCP_URL").unwrap_or_else(|| DEFAULT_URL.to_string());
        return parse(&url, token);
    }
    let Some(text) = candidates(env)
        .into_iter()
        .find_map(|file| std::fs::read_to_string(file).ok())
    else {
        return Err(CliError::new(
            Kind::Network,
            "Hey Postie is not running, or its assistant is off. Ask the user to open Hey Postie and turn on Settings › Claude.",
        ));
    };
    let file: serde_json::Value = serde_json::from_str(&text)
        .map_err(|_| CliError::new(Kind::Other, format!("{FILE_NAME} is unreadable.")))?;
    match (file["url"].as_str(), file["token"].as_str()) {
        (Some(url), Some(token)) => parse(url, token.to_string()),
        _ => Err(CliError::new(
            Kind::Other,
            format!("{FILE_NAME} lacks its url or token."),
        )),
    }
}

/// Tauri's app data dir on each system; on macOS also the sandboxed (App Store) build's container.
fn candidates(env: Env) -> Vec<PathBuf> {
    let home = env("HOME").map(PathBuf::from);
    let mut dirs: Vec<PathBuf> = Vec::new();
    if cfg!(target_os = "macos") {
        if let Some(home) = home {
            dirs.push(home.join("Library/Application Support"));
            dirs.push(home.join(format!(
                "Library/Containers/{IDENTIFIER}/Data/Library/Application Support"
            )));
        }
    } else if cfg!(windows) {
        dirs.extend(env("APPDATA").map(PathBuf::from));
    } else {
        let data = env("XDG_DATA_HOME")
            .filter(|dir| !dir.is_empty())
            .map(PathBuf::from)
            .or_else(|| home.map(|home| home.join(".local/share")));
        dirs.extend(data);
    }
    dirs.into_iter()
        .map(|dir| dir.join(IDENTIFIER).join(FILE_NAME))
        .collect()
}

/// `http://<127.0.0.1 or localhost>:<port><path>`; any other host would send the token away.
fn parse(url: &str, token: String) -> Result<Endpoint, CliError> {
    let wrong = || {
        CliError::usage(format!(
            "The endpoint must look like {DEFAULT_URL} (127.0.0.1 or localhost only), not {url}."
        ))
    };
    let rest = url.strip_prefix("http://").ok_or_else(wrong)?;
    let (authority, path) = rest.split_at(rest.find('/').unwrap_or(rest.len()));
    let (host, port) = authority.rsplit_once(':').ok_or_else(wrong)?;
    if host != "127.0.0.1" && host != "localhost" {
        return Err(wrong());
    }
    Ok(Endpoint {
        host: host.to_string(),
        port: port.parse().map_err(|_| wrong())?,
        path: if path.is_empty() { "/mcp" } else { path }.to_string(),
        token,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env_of(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect();
        move |name| map.get(name).cloned()
    }

    fn temp_home(name: &str) -> PathBuf {
        let home = std::env::temp_dir().join(format!("postie-home-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        home
    }

    fn data_dir(home: &std::path::Path) -> PathBuf {
        if cfg!(target_os = "macos") {
            home.join("Library/Application Support").join(IDENTIFIER)
        } else {
            home.join(".local/share").join(IDENTIFIER)
        }
    }

    #[test]
    fn the_environment_wins() {
        let env = env_of(&[("POSTIE_MCP_TOKEN", "t"), ("HOME", "/nowhere")]);
        let endpoint = locate(&env).unwrap();
        assert_eq!(endpoint.url(), DEFAULT_URL);
        assert_eq!(endpoint.token, "t");
        let env = env_of(&[
            ("POSTIE_MCP_TOKEN", "t"),
            ("POSTIE_MCP_URL", "http://localhost:9000/mcp"),
        ]);
        assert_eq!(locate(&env).unwrap().port, 9000);
    }

    #[cfg(unix)]
    #[test]
    fn reads_the_file_the_app_writes() {
        let home = temp_home("file");
        std::fs::create_dir_all(data_dir(&home)).unwrap();
        std::fs::write(
            data_dir(&home).join(FILE_NAME),
            r#"{"url":"http://127.0.0.1:7500/mcp","token":"from-file"}"#,
        )
        .unwrap();
        let env = env_of(&[("HOME", home.to_str().unwrap()), ("XDG_DATA_HOME", "")]);
        let endpoint = locate(&env).unwrap();
        assert_eq!(
            (endpoint.port, endpoint.token.as_str()),
            (7500, "from-file")
        );
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn no_file_means_the_app_is_closed_or_off() {
        let home = temp_home("none");
        let env = env_of(&[("HOME", home.to_str().unwrap())]);
        let error = locate(&env).unwrap_err();
        assert_eq!(error.exit_code(), 2);
        assert!(error.message.contains("Settings › Claude"));
    }

    #[test]
    fn never_sends_the_token_off_the_machine() {
        for url in [
            "http://example.org:7413/mcp",
            "https://127.0.0.1:7413/mcp",
            "http://127.0.0.1.evil.org:7413/mcp",
            "http://127.0.0.1/mcp",
        ] {
            let error = parse(url, "secret".into()).unwrap_err();
            assert_eq!(error.exit_code(), 1, "{url}");
            assert!(!error.message.contains("secret"));
        }
    }
}
