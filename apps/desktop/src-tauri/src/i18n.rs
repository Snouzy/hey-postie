//! The few texts the Rust side shows (the tray menu and tooltip). They cannot come from the
//! interface's dictionaries, so the two languages live here, picked once from the system locale.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Language {
    En,
    Fr,
}

/// The language for a BCP 47 or POSIX locale (`fr-FR`, `fr_CA.UTF-8`, `fr`); English otherwise.
pub fn language_from_locale(locale: Option<&str>) -> Language {
    let primary = locale
        .unwrap_or("")
        .split(['-', '_', '.', '@'])
        .next()
        .unwrap_or("");
    if primary.eq_ignore_ascii_case("fr") {
        Language::Fr
    } else {
        Language::En
    }
}

/// The language of the system the app runs on.
pub fn system_language() -> Language {
    language_from_locale(sys_locale::get_locale().as_deref())
}

impl Language {
    pub fn open_app(self) -> &'static str {
        match self {
            Language::En => "Open Hey Postie",
            Language::Fr => "Ouvrir Hey Postie",
        }
    }

    pub fn quit(self) -> &'static str {
        match self {
            Language::En => "Quit",
            Language::Fr => "Quitter",
        }
    }

    /// The tray tooltip: the app name alone, or with the unread count.
    pub fn tooltip(self, unread: u32) -> String {
        match (self, unread) {
            (_, 0) => "Hey Postie".to_owned(),
            (Language::En, 1) => "Hey Postie: 1 unread".to_owned(),
            (Language::En, n) => format!("Hey Postie: {n} unread"),
            (Language::Fr, 1) => "Hey Postie : 1 non lu".to_owned(),
            (Language::Fr, n) => format!("Hey Postie : {n} non lus"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn french_locales_pick_french() {
        for locale in ["fr", "fr-FR", "fr_CA", "fr_BE.UTF-8", "FR-ch", "fr@euro"] {
            assert_eq!(language_from_locale(Some(locale)), Language::Fr, "{locale}");
        }
    }

    #[test]
    fn everything_else_falls_back_to_english() {
        for locale in [Some("en-US"), Some("de_DE"), Some("frr"), Some(""), None] {
            assert_eq!(language_from_locale(locale), Language::En, "{locale:?}");
        }
    }

    #[test]
    fn texts_follow_the_language() {
        assert_eq!(Language::Fr.open_app(), "Ouvrir Hey Postie");
        assert_eq!(Language::Fr.quit(), "Quitter");
        assert_eq!(Language::En.tooltip(0), "Hey Postie");
        assert_eq!(Language::En.tooltip(1), "Hey Postie: 1 unread");
        assert_eq!(Language::Fr.tooltip(3), "Hey Postie : 3 non lus");
    }
}
