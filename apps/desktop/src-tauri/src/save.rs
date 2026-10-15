//! "Save" on an attachment. The webview sends the bytes (raw IPC body) and a suggested name
//! (header); the save panel runs here and the file is written here. No path ever crosses the
//! IPC, so the webview cannot write anywhere the user did not pick, and in the macOS sandbox the
//! panel itself grants the write to the chosen file (entitlement `files.user-selected.read-write`).
//! The bytes and the name are never logged.

use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

/// Larger files are refused before the panel opens: the whole body sits in memory, twice.
pub const MAX_BYTES: usize = 200 * 1024 * 1024;
/// Set by `app/saveFile.ts`, percent-encoded (header values are ASCII).
pub const NAME_HEADER: &str = "x-file-name";

#[derive(Debug, thiserror::Error)]
pub enum SaveError {
    #[error("FileTooLarge")]
    TooLarge,
    #[error("NoBytes")]
    NoBytes,
    #[error("NoFileName")]
    NoFileName,
    #[error("DialogClosed")]
    DialogClosed,
    #[error("NotAPath")]
    NotAPath,
    #[error("Io: {0}")]
    Io(#[from] std::io::Error),
}

/// `Ok(true)` once the file is written, `Ok(false)` when the user cancelled the panel.
pub async fn save<R: Runtime>(app: &AppHandle<R>, request: Request<'_>) -> Result<bool, SaveError> {
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        InvokeBody::Json(_) => return Err(SaveError::NoBytes),
    };
    check_size(bytes.len())?;
    let name = request
        .headers()
        .get(NAME_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(file_name)
        .ok_or(SaveError::NoFileName)?;

    let Some(path) = ask_where(app, name).await? else {
        return Ok(false);
    };
    // `Request` borrows the body; the write happens off the async runtime, so it needs its own copy.
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || std::fs::write(path, bytes))
        .await
        .map_err(|_| SaveError::DialogClosed)??;
    Ok(true)
}

pub fn check_size(len: usize) -> Result<(), SaveError> {
    if len > MAX_BYTES {
        Err(SaveError::TooLarge)
    } else {
        Ok(())
    }
}

/// The decoded header as a bare file name: no directory, no `..`, not empty.
pub fn file_name(header: &str) -> Option<String> {
    let decoded = percent_decode_str(header).decode_utf8().ok()?;
    let name = Path::new(decoded.as_ref()).file_name()?.to_str()?;
    if name.is_empty() || name == ".." || name.contains(['/', '\\']) {
        return None;
    }
    Some(name.to_owned())
}

async fn ask_where<R: Runtime>(
    app: &AppHandle<R>,
    name: String,
) -> Result<Option<PathBuf>, SaveError> {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(name)
        .save_file(move |path| {
            let _ = tx.send(path);
        });
    match rx.await.map_err(|_| SaveError::DialogClosed)? {
        None => Ok(None),
        Some(chosen) => chosen
            .into_path()
            .map(Some)
            .map_err(|_| SaveError::NotAPath),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cap_is_200_mib() {
        assert!(check_size(0).is_ok());
        assert!(check_size(MAX_BYTES).is_ok());
        assert!(matches!(
            check_size(MAX_BYTES + 1),
            Err(SaveError::TooLarge)
        ));
    }

    #[test]
    fn the_name_is_decoded_and_kept_bare() {
        assert_eq!(file_name("report.pdf").as_deref(), Some("report.pdf"));
        assert_eq!(
            file_name("%C3%A9t%C3%A9%20%E2%9C%93.txt").as_deref(),
            Some("été ✓.txt")
        );
        assert_eq!(
            file_name("..%2F..%2Fetc%2Fpasswd").as_deref(),
            Some("passwd")
        );
        assert_eq!(file_name("dir/inner.txt").as_deref(), Some("inner.txt"));
    }

    #[test]
    fn empty_or_directory_names_are_refused() {
        assert_eq!(file_name(""), None);
        assert_eq!(file_name(".."), None);
        assert_eq!(file_name("/"), None);
        assert_eq!(file_name("%FF"), None);
    }
}
