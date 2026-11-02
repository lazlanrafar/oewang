//! A string that refuses to print itself.
//!
//! Passwords, tokens and keys are never logged (OPS-3). Wrapping them in a
//! type whose Debug and Display print `[redacted]` makes that the default
//! rather than something every call site has to remember.

use std::fmt;

#[derive(Clone, PartialEq, Eq)]
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The only way to read it. Named so a review can grep for it.
    pub fn expose(&self) -> &str {
        &self.0
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[redacted]")
    }
}

impl fmt::Display for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[redacted]")
    }
}

impl From<String> for Secret {
    fn from(value: String) -> Self {
        Self(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_redact_in_debug_and_display() {
        let secret = Secret::new("super-secret-jwt-signing-key");
        assert_eq!(format!("{secret:?}"), "[redacted]");
        assert_eq!(format!("{secret}"), "[redacted]");
        assert!(!format!("{secret:?}").contains("super"));
    }

    #[test]
    fn should_redact_when_nested_in_a_struct() {
        #[derive(Debug)]
        #[allow(dead_code)]
        struct Config {
            jwt_secret: Secret,
        }
        let config = Config { jwt_secret: Secret::new("leak-me") };
        assert!(!format!("{config:?}").contains("leak-me"));
    }

    #[test]
    fn should_expose_only_on_request() {
        assert_eq!(Secret::new("value").expose(), "value");
    }
}
