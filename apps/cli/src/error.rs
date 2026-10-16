//! Every failure is one JSON line on stderr and one exit code (spec 2026-10-17-agent-cli-design).

/// What went wrong, as an agent needs to know it: each kind has its own exit code.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// A bad command, a bad argument, or input the app refused as malformed.
    Usage,
    /// The app is closed, its assistant is off, or it did not answer.
    Network,
    /// The token was refused.
    Auth,
    /// The app refused the action (permission level, sealed chat, not signed in), or anything else.
    Other,
}

#[derive(Debug, PartialEq, Eq)]
pub struct CliError {
    pub kind: Kind,
    pub message: String,
}

impl CliError {
    pub fn new(kind: Kind, message: impl Into<String>) -> Self {
        CliError {
            kind,
            message: message.into(),
        }
    }

    pub fn usage(message: impl Into<String>) -> Self {
        Self::new(Kind::Usage, message)
    }

    pub fn exit_code(&self) -> i32 {
        match self.kind {
            Kind::Usage => 1,
            Kind::Network => 2,
            Kind::Auth => 3,
            Kind::Other => 4,
        }
    }

    /// `{"error": "<category>", "message": "…"}`, the shape agents read on stderr.
    pub fn to_json(&self) -> serde_json::Value {
        let category = match self.kind {
            Kind::Usage => "usage",
            Kind::Network => "network",
            Kind::Auth => "auth",
            Kind::Other => "other",
        };
        serde_json::json!({ "error": category, "message": self.message })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_kind_has_its_exit_code_and_category() {
        let cases = [
            (Kind::Usage, 1, "usage"),
            (Kind::Network, 2, "network"),
            (Kind::Auth, 3, "auth"),
            (Kind::Other, 4, "other"),
        ];
        for (kind, code, category) in cases {
            let error = CliError::new(kind, "why");
            assert_eq!(error.exit_code(), code);
            assert_eq!(error.to_json()["error"], category);
            assert_eq!(error.to_json()["message"], "why");
        }
    }
}
