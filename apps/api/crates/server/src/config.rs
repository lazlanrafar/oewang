//! Configuration, read from the environment and validated at startup.
//!
//! A missing or malformed required variable stops the process here rather than
//! failing at first use, which is the difference between a container that
//! never starts and a 500 three hours later.
//!
//! Every variable is documented in .env.example and
//! docs/architecture.md#configuration.

use std::time::Duration;

use oewang_domain::Secret;

// Several fields are read only once their feature lands: the JWT settings in
// US-008, the AI service client in US-026. They are parsed and validated now
// so a deployment fails at startup rather than at first use.
#[allow(dead_code)]
#[derive(Debug)]
pub struct Config {
    pub app_env: AppEnv,
    pub port: u16,

    pub database_url: Secret,
    pub db_max_connections: u32,
    pub db_acquire_timeout: Duration,
    pub db_statement_timeout: Duration,

    pub jwt_secret: Secret,
    pub access_token_ttl: Duration,
    pub refresh_token_ttl: Duration,

    pub app_url: String,
    pub resend_api_key: Option<Secret>,
    pub email_from: String,
    pub ai_service_url: String,
    pub ai_service_api_key: Secret,

    /// The daily rate source (D44). The key is optional: the keyless
    /// endpoint still answers, and a lookup that fails for any reason just
    /// moves the resolution ladder down a step (TXN-22).
    pub fx_api_url: String,
    pub fx_access_key: Option<Secret>,
    /// How often the daily job refreshes the cache.
    pub fx_refresh_interval: Duration,

    /// `local` or `s3` (D19).
    pub storage_backend: String,
    pub storage_local_path: String,
    pub s3_endpoint: String,
    pub s3_bucket: String,
    pub s3_region: String,
    pub s3_access_key_id: String,
    pub s3_secret_access_key: Secret,

    pub crypto_signing_key_file: std::path::PathBuf,
    pub owe1_enabled: bool,

    pub request_timeout: Duration,
    pub body_limit_bytes: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppEnv {
    Development,
    Production,
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("{0} is required but not set")]
    Missing(&'static str),
    #[error("{name} is invalid: {reason}")]
    Invalid { name: &'static str, reason: String },
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let app_env = match optional("APP_ENV").as_deref() {
            Some("production") => AppEnv::Production,
            _ => AppEnv::Development,
        };

        let jwt_secret = required("JWT_SECRET")?;
        // HS256 with a short key is a weak signature, and a default left in
        // place is worse. Refuse rather than warn.
        if jwt_secret.len() < 32 {
            return Err(ConfigError::Invalid {
                name: "JWT_SECRET",
                reason: format!("must be at least 32 characters, got {}", jwt_secret.len()),
            });
        }

        let ai_service_api_key = required("AI_SERVICE_API_KEY")?;
        if app_env == AppEnv::Production && ai_service_api_key.len() < 32 {
            return Err(ConfigError::Invalid {
                name: "AI_SERVICE_API_KEY",
                reason: "must be at least 32 characters in production".into(),
            });
        }

        // Plaintext mode exists only for local development. Anywhere else it
        // would quietly undo D22, so it is refused rather than warned about.
        let owe1_enabled = optional("OWE1_ENABLED")
            .map(|v| v != "false")
            .unwrap_or(true);
        if !owe1_enabled && app_env != AppEnv::Development {
            return Err(ConfigError::Invalid {
                name: "OWE1_ENABLED",
                reason: "payload encryption can only be disabled in development".into(),
            });
        }

        // Without a provider, email is printed to the log. That is a
        // development convenience and nothing else: in production a password
        // reset nobody receives is an account nobody can recover (AUTH-10).
        let resend_api_key = optional("RESEND_API_KEY");
        if resend_api_key.is_none() && app_env == AppEnv::Production {
            return Err(ConfigError::Missing("RESEND_API_KEY"));
        }

        // A bucket nobody configured is a 500 on the first upload rather
        // than a message at startup, so it fails here instead.
        let storage_backend = optional("STORAGE_BACKEND").unwrap_or_else(|| "local".into());
        if storage_backend == "s3" {
            for name in ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] {
                if optional(name).is_none() {
                    return Err(ConfigError::Missing(name));
                }
            }
        } else if storage_backend != "local" {
            return Err(ConfigError::Invalid {
                name: "STORAGE_BACKEND",
                reason: format!("expected local or s3, got {storage_backend:?}"),
            });
        }

        Ok(Self {
            app_env,
            port: parse_or("API_PORT", 3002)?,

            database_url: Secret::new(required("DATABASE_URL")?),
            db_max_connections: parse_or("DB_MAX_CONNECTIONS", 20)?,
            db_acquire_timeout: Duration::from_secs(parse_or("DB_ACQUIRE_TIMEOUT_SECS", 5)?),
            db_statement_timeout: Duration::from_secs(parse_or("DB_STATEMENT_TIMEOUT_SECS", 10)?),

            jwt_secret: Secret::new(jwt_secret),
            access_token_ttl: parse_duration("ACCESS_TOKEN_TTL", "15m")?,
            refresh_token_ttl: parse_duration("REFRESH_TOKEN_TTL", "30d")?,

            app_url: optional("APP_URL").unwrap_or_else(|| "http://localhost:3000".into()),
            resend_api_key: resend_api_key.map(Secret::new),
            email_from: optional("EMAIL_FROM")
                .unwrap_or_else(|| "oewang <no-reply@localhost>".into()),
            ai_service_url: optional("AI_SERVICE_URL").unwrap_or_else(|| "http://ai:3004".into()),
            ai_service_api_key: Secret::new(ai_service_api_key),

            owe1_enabled,

            fx_api_url: optional("FX_API_URL")
                .unwrap_or_else(|| "https://api.exchangerate.host".into()),
            fx_access_key: optional("FX_ACCESS_KEY").map(Secret::new),
            fx_refresh_interval: parse_duration("FX_REFRESH_INTERVAL", "24h")?,

            storage_backend: storage_backend.clone(),
            storage_local_path: optional("STORAGE_LOCAL_PATH")
                .unwrap_or_else(|| "./.storage".into()),
            s3_endpoint: optional("S3_ENDPOINT").unwrap_or_default(),
            s3_bucket: optional("S3_BUCKET").unwrap_or_default(),
            s3_region: optional("S3_REGION").unwrap_or_else(|| "auto".into()),
            s3_access_key_id: optional("S3_ACCESS_KEY_ID").unwrap_or_default(),
            s3_secret_access_key: Secret::new(optional("S3_SECRET_ACCESS_KEY").unwrap_or_default()),

            crypto_signing_key_file: optional("CRYPTO_SIGNING_KEY_FILE")
                .unwrap_or_else(|| "./.secrets/owe1-signing-key.pem".into())
                .into(),

            request_timeout: Duration::from_secs(parse_or("REQUEST_TIMEOUT_SECS", 30)?),
            body_limit_bytes: parse_or("BODY_LIMIT_BYTES", 1024 * 1024)?,
        })
    }
}

fn optional(name: &str) -> Option<String> {
    match std::env::var(name) {
        Ok(value) if !value.trim().is_empty() => Some(value),
        _ => None,
    }
}

fn required(name: &'static str) -> Result<String, ConfigError> {
    optional(name).ok_or(ConfigError::Missing(name))
}

fn parse_or<T>(name: &'static str, default: T) -> Result<T, ConfigError>
where
    T: std::str::FromStr,
    T::Err: std::fmt::Display,
{
    match optional(name) {
        None => Ok(default),
        Some(raw) => raw.parse().map_err(|e: T::Err| ConfigError::Invalid {
            name,
            reason: e.to_string(),
        }),
    }
}

/// Accepts `15m`, `30d`, `90s`, `12h`, or a bare number of seconds.
fn parse_duration(name: &'static str, default: &str) -> Result<Duration, ConfigError> {
    let raw = optional(name).unwrap_or_else(|| default.to_string());
    let raw = raw.trim();

    let (digits, multiplier) = match raw.chars().last() {
        Some('s') => (&raw[..raw.len() - 1], 1),
        Some('m') => (&raw[..raw.len() - 1], 60),
        Some('h') => (&raw[..raw.len() - 1], 60 * 60),
        Some('d') => (&raw[..raw.len() - 1], 60 * 60 * 24),
        _ => (raw, 1),
    };

    let value: u64 = digits.parse().map_err(|_| ConfigError::Invalid {
        name,
        reason: format!("expected a duration like 15m, 24h or 30d, got {raw:?}"),
    })?;

    Ok(Duration::from_secs(value * multiplier))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_parse_duration_suffixes() {
        std::env::set_var("TEST_TTL", "15m");
        assert_eq!(parse_duration("TEST_TTL", "1s").unwrap(), Duration::from_secs(900));
        std::env::set_var("TEST_TTL", "30d");
        assert_eq!(parse_duration("TEST_TTL", "1s").unwrap(), Duration::from_secs(2_592_000));
        std::env::set_var("TEST_TTL", "90");
        assert_eq!(parse_duration("TEST_TTL", "1s").unwrap(), Duration::from_secs(90));
        std::env::remove_var("TEST_TTL");
    }

    #[test]
    fn should_reject_a_malformed_duration() {
        std::env::set_var("TEST_BAD_TTL", "soon");
        let error = parse_duration("TEST_BAD_TTL", "1s").unwrap_err();
        assert!(matches!(error, ConfigError::Invalid { .. }));
        std::env::remove_var("TEST_BAD_TTL");
    }

    #[test]
    fn should_treat_an_empty_variable_as_unset() {
        std::env::set_var("TEST_EMPTY", "   ");
        assert!(optional("TEST_EMPTY").is_none());
        assert!(matches!(required("TEST_EMPTY"), Err(ConfigError::Missing(_))));
        std::env::remove_var("TEST_EMPTY");
    }

    #[test]
    fn should_not_leak_secrets_in_debug_output() {
        let config_fragment = Secret::new("a-very-real-signing-key-value");
        assert!(!format!("{config_fragment:?}").contains("real"));
    }
}
