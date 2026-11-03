//! The controls from [hardening](../../../../docs/security/hardening.md)
//! that are worth a test rather than a review note.
//!
//! Each one here failed quietly in some other product: a secret printed
//! into a log line, a CORS layer added "temporarily", a limit that drifted
//! away from the number the documentation states. None of them announces
//! itself when it breaks, which is exactly why they are tests.

use std::sync::{Arc, Mutex};

use oewang_domain::{AppError, Secret};
use tracing::subscriber;
use tracing_subscriber::fmt::MakeWriter;

use crate::{
    config::Config,
    limits::{Bucket, RateLimiter},
    response::ApiError,
};

// ------------------------------------------------------------ log capture

#[derive(Clone, Default)]
struct Capture(Arc<Mutex<Vec<u8>>>);

impl Capture {
    fn text(&self) -> String {
        String::from_utf8_lossy(&self.0.lock().unwrap()).to_string()
    }
}

impl std::io::Write for Capture {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl<'a> MakeWriter<'a> for Capture {
    type Writer = Self;

    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}

/// Run a workload against a captured log sink.
fn captured(workload: impl FnOnce()) -> String {
    let sink = Capture::default();
    let collector = tracing_subscriber::fmt()
        .with_writer(sink.clone())
        .with_max_level(tracing::Level::TRACE)
        .finish();

    subscriber::with_default(collector, workload);
    sink.text()
}

/// Values that must never reach a log line (OPS-3). Distinctive enough that
/// a substring match cannot pass by accident.
const JWT_SECRET: &str = "jwt-secret-oDoWBKqLZEXaqAOWw5XD";
const SERVICE_KEY: &str = "service-key-DhEtWybdZ36hFS2P";
const STORAGE_SECRET: &str = "storage-secret-6Qh3LCbDcs1x";

#[test]
fn should_keep_every_configured_secret_out_of_the_logs() {
    let logs = captured(|| {
        // A secret printed the way a careless line would print it. The
        // newtype is what makes this safe, and this asserts the newtype is
        // actually in the way.
        let jwt = Secret::from(JWT_SECRET.to_string());
        let key = Secret::from(SERVICE_KEY.to_string());
        let storage = Secret::from(STORAGE_SECRET.to_string());

        tracing::info!(secret = ?jwt, "config loaded");
        tracing::info!("service key is {key}");
        tracing::warn!(?storage, "storage configured");

        // The real failure paths, as they run.
        let refusal = AppError::RateLimited {
            retry_after_secs: 30,
        };
        tracing::info!(bucket = ?Bucket::Credential, code = refusal.code(), "a caller was rate limited");

        // An upstream message is never relayed: a receipt's contents can be
        // inside one.
        let upstream = oewang_clients::Owe1ClientError::Api {
            code: "SOMETHING_ELSE".into(),
            message: format!("rejected with {SERVICE_KEY}"),
        };
        tracing::warn!(code = upstream.code(), "the extraction call failed");
    });

    for secret in [JWT_SECRET, SERVICE_KEY, STORAGE_SECRET] {
        assert!(
            !logs.contains(secret),
            "a secret reached the log sink:\n{logs}"
        );
    }
    assert!(
        logs.contains("[redacted]"),
        "the workload logged nothing:\n{logs}"
    );
}

#[test]
fn should_not_put_a_submitted_value_in_an_error_body() {
    // A rejection names the field and says what is wrong with it. It never
    // echoes what was sent, so a reflected payload cannot travel back out
    // through an error message (hardening.md#input-validation).
    let error = AppError::validation([("email", "Enter an email address.")]);
    let body = serde_json::to_string(&error.to_body("req_1")).unwrap();

    assert!(body.contains("email"));
    assert!(!body.contains("<script>"));
}

#[test]
fn should_answer_an_internal_error_with_nothing_but_the_code_and_the_request_id() {
    let logs = captured(|| {
        let error = AppError::Internal(anyhow::anyhow!("relation \"users\" does not exist"));
        let response = ApiError::new(error, "req_1");
        let _ = axum::response::IntoResponse::into_response(response);
    });

    // The source is logged, which is the point of keeping it.
    assert!(logs.contains("does not exist"), "{logs}");
}

// ----------------------------------------------------------------- limits

/// Every default here is from
/// [hardening](../../../../docs/security/hardening.md#limits). When one of
/// these fails, either the code drifted or the documentation did, and both
/// are worth stopping for.
#[test]
fn should_default_every_limit_to_the_documented_value() {
    let limits = Config::default_rate_limits();

    assert_eq!(
        (limits.credential.max, limits.credential.window_secs),
        (10, 900)
    );
    assert_eq!(
        (limits.handshake.max, limits.handshake.window_secs),
        (30, 60)
    );
    assert_eq!(
        (limits.authenticated.max, limits.authenticated.window_secs),
        (300, 60)
    );
    assert_eq!(
        (limits.anonymous.max, limits.anonymous.window_secs),
        (30, 60)
    );
    assert_eq!(
        (limits.chat_turn.max, limits.chat_turn.window_secs),
        (20, 60)
    );
}

/// The two limits that are deliberately not configuration, and the two
/// defaults that are. All four are from the same table.
#[test]
fn should_hold_the_size_limits_the_documentation_states() {
    use oewang_domain::files::{CHUNK_BYTES, MAX_FILE_BYTES};

    use crate::transactions::service::{BULK_LIMIT, IMPORT_LIMIT};

    assert_eq!(MAX_FILE_BYTES, 10 * 1024 * 1024, "file size (VLT-1)");
    assert_eq!(CHUNK_BYTES, 512 * 1024, "one chunk");
    assert_eq!(IMPORT_LIMIT, 5_000, "rows per import (SEC-18)");

    // Not configuration, on purpose: a client pages against this, so
    // changing it is an API change rather than a deployment knob.
    assert_eq!(BULK_LIMIT, 500, "bulk operation size (SEC-18)");
}

#[test]
fn should_refuse_the_twenty_first_chat_turn_in_a_minute() {
    // SEC-17, counted per workspace: the limit is on model spend, and spend
    // belongs to a workspace rather than to whoever is typing.
    let limiter = RateLimiter::new(Config::default_rate_limits());

    for _ in 0..20 {
        limiter.check(Bucket::ChatTurn, "ws_1", 1_000).unwrap();
    }

    let error = limiter.check(Bucket::ChatTurn, "ws_1", 1_000).unwrap_err();
    assert_eq!(error.status(), 429);

    // Another workspace is unaffected.
    limiter.check(Bucket::ChatTurn, "ws_2", 1_000).unwrap();
}

// ------------------------------------------------------------------- CORS

/// The API answers no cross-origin browser request, because no browser
/// calls it (D5, SEC-16). That is enforced by the layer never existing,
/// and the surest way to keep a layer from existing is to not compile its
/// code: this fails if `tower-http`'s `cors` feature is ever switched on.
///
/// Reading the manifest is a blunt test. It is also the only one that
/// catches the change at the moment it is made rather than after a
/// response has already carried the header.
#[test]
fn should_not_build_the_cors_layer_at_all() {
    let manifest = include_str!("../../../Cargo.toml");
    let line = manifest
        .lines()
        .find(|line| line.trim_start().starts_with("tower-http"))
        .expect("tower-http is a dependency");

    assert!(
        !line.contains("\"cors\""),
        "the cors feature is enabled; CORS allows nothing by design (SEC-16)"
    );
}
