//! The file through which the `postie` command line finds the endpoint (spec
//! 2026-10-17-agent-cli-design): `<app data dir>/mcp-endpoint.json`, `{"url", "token"}`, readable
//! by the user only, present only while the endpoint listens. Never logged.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = "mcp-endpoint.json";

fn url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/mcp")
}

/// Writes the file for this port and token, replacing any previous one in a single rename.
pub fn write(dir: &Path, port: u16, token: &str) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let body = serde_json::json!({ "url": url(port), "token": token }).to_string();
    let partial = dir.join(format!("{FILE_NAME}.partial"));
    let _ = fs::remove_file(&partial);
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut file = options.open(&partial)?;
    file.write_all(body.as_bytes())?;
    file.sync_all()?;
    fs::rename(&partial, path(dir))
}

/// Removes the file if it still names this port: another window may have written its own since.
pub fn remove(dir: &Path, port: u16) {
    let file = path(dir);
    let ours = fs::read_to_string(&file)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .is_some_and(|value| value["url"] == url(port));
    if ours {
        let _ = fs::remove_file(file);
    }
}

fn path(dir: &Path) -> PathBuf {
    dir.join(FILE_NAME)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("postie-discovery-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn writes_the_url_and_the_token() {
        let dir = temp_dir("write");
        write(&dir, 7413, "secret").unwrap();
        let value: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(path(&dir)).unwrap()).unwrap();
        assert_eq!(value["url"], "http://127.0.0.1:7413/mcp");
        assert_eq!(value["token"], "secret");
        write(&dir, 7413, "rotated").unwrap();
        assert!(fs::read_to_string(path(&dir)).unwrap().contains("rotated"));
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn only_the_user_can_read_it() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("mode");
        write(&dir, 7413, "secret").unwrap();
        let mode = fs::metadata(path(&dir)).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn removes_only_its_own_file() {
        let dir = temp_dir("remove");
        write(&dir, 7413, "secret").unwrap();
        remove(&dir, 7414);
        assert!(path(&dir).exists());
        remove(&dir, 7413);
        assert!(!path(&dir).exists());
        remove(&dir, 7413);
        let _ = fs::remove_dir_all(dir);
    }
}
