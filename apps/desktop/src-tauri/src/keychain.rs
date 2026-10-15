//! Passwords live in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret
//! Service), keyed by JID. Nothing here logs a password.

use keyring_core::{Entry, Error};

const SERVICE: &str = "com.snouzylabs.heypostie";

#[derive(Debug, thiserror::Error)]
pub enum KeychainError {
    /// The platform store could not be reached: the password is simply not kept.
    #[error("KeychainUnavailable")]
    Unavailable(#[source] Error),
}

impl From<Error> for KeychainError {
    fn from(error: Error) -> Self {
        KeychainError::Unavailable(error)
    }
}

/// Installs the platform credential store once. Safe to call several times; a failure is not
/// fatal here: every later call reports `KeychainUnavailable`.
pub fn install_platform_store() {
    let _ = keyring::Entry::store_status();
}

pub fn get(jid: &str) -> Result<Option<String>, KeychainError> {
    match Entry::new(SERVICE, jid)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn set(jid: &str, password: &str) -> Result<(), KeychainError> {
    Entry::new(SERVICE, jid)?.set_password(password)?;
    Ok(())
}

pub fn delete(jid: &str) -> Result<(), KeychainError> {
    match Entry::new(SERVICE, jid)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(error.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn use_mock_store() {
        let store = keyring_core::mock::Store::new().expect("mock store");
        keyring_core::set_default_store(store);
    }

    #[test]
    fn round_trip_with_the_mock_store() {
        use_mock_store();
        assert_eq!(get("a@b.org").unwrap(), None);
        set("a@b.org", "pw").unwrap();
        assert_eq!(get("a@b.org").unwrap(), Some("pw".into()));
        delete("a@b.org").unwrap();
        assert_eq!(get("a@b.org").unwrap(), None);
        // Deleting twice is fine.
        delete("a@b.org").unwrap();
    }

    #[test]
    fn errors_say_unavailable_without_the_password() {
        let error = KeychainError::from(Error::NoDefaultStore);
        assert_eq!(error.to_string(), "KeychainUnavailable");
    }
}
