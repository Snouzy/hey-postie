//! `pnpm desktop:dev:alice`: a dev window that signs in by itself, so iterating against the local
//! test server needs no form and no keychain. `HEY_POSTIE_DEV_LOGIN="jid:password"`, read in debug
//! builds only: a release build never signs in from the environment. The password is a test one
//! (`tools/xmpp-server/users.sh`); it is never stored or logged.

/// The credentials of the dev sign-in, when the run sets them.
#[tauri::command]
pub fn dev_login() -> Option<(String, String)> {
    if !cfg!(debug_assertions) {
        return None;
    }
    parse(&std::env::var("HEY_POSTIE_DEV_LOGIN").ok()?)
}

/// `jid:password`, split on the first colon (a password may hold more).
fn parse(value: &str) -> Option<(String, String)> {
    let (jid, password) = value.split_once(':')?;
    (!jid.is_empty() && !password.is_empty()).then(|| (jid.to_owned(), password.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_on_the_first_colon() {
        assert_eq!(
            parse("alice@localhost:pw:x"),
            Some(("alice@localhost".into(), "pw:x".into()))
        );
    }

    #[test]
    fn ignores_a_value_without_both_parts() {
        assert_eq!(parse("alice@localhost"), None);
        assert_eq!(parse(":pw"), None);
        assert_eq!(parse("alice@localhost:"), None);
    }
}
