//! Rate limits, in process memory.
//!
//! Every limit here is from [hardening](../../../../docs/security/hardening.md#limits)
//! and every one is a configuration value with the documented default, never
//! a literal in a handler.
//!
//! A sliding window, not a fixed one: a fixed window lets a caller spend the
//! whole budget at 11:59:59 and the whole budget again at 12:00:00, which is
//! twice the limit at the only moment anybody would aim for. The shape is the
//! same as the AI service's `app/core/ratelimit.py`, deliberately, so the two
//! processes do not drift in what "20 per minute" means.
//!
//! In memory, so a restart forgives everyone and a second instance counts
//! separately. Both are acceptable: this bounds abuse and spend, it is not an
//! accounting system, and the alternative is a shared store on the request
//! path of every call (D10).

use std::{
    collections::{HashMap, VecDeque},
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::Duration,
};

use axum::{
    extract::{ConnectInfo, Request, State},
    http::{header, HeaderMap},
    middleware::Next,
    response::{IntoResponse, Response},
};
use oewang_domain::AppError;

use crate::{
    config::Config,
    owe1::session::now_secs,
    response::{ApiError, RequestId},
    state::AppState,
};

/// Which budget a request is counted against.
///
/// The buckets are separate because they answer different questions. A
/// password guess and a page load are both HTTP requests and nothing else
/// about them is alike.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Bucket {
    /// The routes that take a credential or mint one (AUTH-6).
    Credential,
    /// Opening a crypto session (docs/api/encryption.md#handshake).
    Handshake,
    /// A request carrying a token.
    Authenticated,
    /// Everything else a browser can reach.
    Anonymous,
    /// One chat turn, counted per workspace rather than per address
    /// (SEC-17). The only bucket not keyed by an IP, because the cost it
    /// bounds is model spend and that belongs to a workspace.
    ChatTurn,
}

/// How often the sweeper drops windows nobody is filling.
const SWEEP_INTERVAL: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy)]
pub struct Limit {
    pub max: u32,
    pub window_secs: i64,
}

impl Limit {
    pub fn new(max: u32, window_secs: i64) -> Self {
        Self { max, window_secs }
    }
}

/// The limits as configured, one per bucket.
#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub credential: Limit,
    pub handshake: Limit,
    pub authenticated: Limit,
    pub anonymous: Limit,
    pub chat_turn: Limit,
}

impl Limits {
    fn of(&self, bucket: Bucket) -> Limit {
        match bucket {
            Bucket::Credential => self.credential,
            Bucket::Handshake => self.handshake,
            Bucket::Authenticated => self.authenticated,
            Bucket::Anonymous => self.anonymous,
            Bucket::ChatTurn => self.chat_turn,
        }
    }
}

/// One caller's calls inside one bucket, oldest first.
type Window = VecDeque<i64>;
type Windows = Arc<Mutex<HashMap<(Bucket, String), Window>>>;

#[derive(Clone)]
pub struct RateLimiter {
    windows: Windows,
    limits: Limits,
}

impl RateLimiter {
    pub fn new(limits: Limits) -> Self {
        Self {
            windows: Arc::new(Mutex::new(HashMap::new())),
            limits,
        }
    }

    /// Record one call and say whether it was within the budget.
    ///
    /// A limit of zero disables the bucket, which is what a development
    /// configuration sets rather than deleting the layer.
    pub fn check(&self, bucket: Bucket, key: &str, now: i64) -> Result<(), AppError> {
        let limit = self.limits.of(bucket);
        if limit.max == 0 {
            return Ok(());
        }

        let cutoff = now - limit.window_secs;
        let mut windows = self.windows.lock().expect("rate limiter poisoned");
        let window = windows.entry((bucket, key.to_string())).or_default();

        while window.front().is_some_and(|stamp| *stamp <= cutoff) {
            window.pop_front();
        }

        if window.len() as u32 >= limit.max {
            // Whole seconds until the oldest call ages out, never zero: a
            // `Retry-After: 0` reads as "immediately", which is the one
            // thing it does not mean.
            let oldest = window.front().copied().unwrap_or(now);
            let retry_after_secs = (oldest + limit.window_secs - now).max(1) as u64;
            return Err(AppError::RateLimited { retry_after_secs });
        }

        window.push_back(now);
        Ok(())
    }

    /// Drop windows that have aged out entirely. Returns how many went.
    pub fn sweep(&self, now: i64) -> usize {
        let mut windows = self.windows.lock().expect("rate limiter poisoned");
        let before = windows.len();

        windows.retain(|(bucket, _), window| {
            let cutoff = now - self.limits.of(*bucket).window_secs;
            window.back().is_some_and(|stamp| *stamp > cutoff)
        });

        before - windows.len()
    }
}

/// Which bucket a path belongs to, and whether it is counted at all.
///
/// `None` means exempt. Two things are: the health routes, which a
/// container probes every few seconds, and the internal routes, which one
/// service calls from one address and which are gated by a key rather than
/// by a budget (OPS-6). Counting the AI service's tool calls against a
/// per-address budget would make a long chat turn look like an attack.
pub fn classify(path: &str, headers: &HeaderMap) -> Option<Bucket> {
    if path.starts_with("/health") || path.starts_with("/v1/internal/") {
        return None;
    }
    if path == "/v1/handshake" || path == "/.well-known/oewang-keys" {
        return Some(Bucket::Handshake);
    }
    if is_credential_route(path) {
        return Some(Bucket::Credential);
    }
    if headers.contains_key(header::AUTHORIZATION) {
        return Some(Bucket::Authenticated);
    }
    Some(Bucket::Anonymous)
}

/// The routes that take a password, a refresh token or a reset token.
///
/// Not every path under `/v1/auth/`, which is what
/// [hardening](../../../../docs/security/hardening.md#limits) says in its
/// table: `/v1/auth/me` is read on every page load, and ten of those per
/// fifteen minutes would lock a working session out of the product. The
/// limit exists for guessing (AUTH-6), so it covers the routes something
/// can be guessed at.
fn is_credential_route(path: &str) -> bool {
    matches!(
        path,
        "/v1/auth/register"
            | "/v1/auth/login"
            | "/v1/auth/refresh"
            | "/v1/auth/forgot-password"
            | "/v1/auth/reset-password"
            | "/v1/auth/passkey/sign-in/start"
            | "/v1/auth/passkey/sign-in/finish"
            | "/v1/workspaces/accept-invite"
    )
}

/// Count this request, or refuse it.
///
/// Placed outside the OWE1 layer on purpose: a flood should cost a hash
/// lookup, not a key agreement and a decryption.
pub async fn enforce(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    let Some(bucket) = classify(request.uri().path(), request.headers()) else {
        return next.run(request).await;
    };

    let caller = client_ip(&state.config, request.headers(), peer).to_string();

    if let Err(error) = state.rate_limits.check(bucket, &caller, now_secs()) {
        // The address is not logged: it is the one piece of this that is
        // personal data, and the bucket is what makes the line useful.
        tracing::info!(?bucket, "a caller was rate limited");

        return ApiError::new(error, RequestId::from_request(&request).0).into_response();
    }

    next.run(request).await
}

/// Who to count this against.
///
/// Behind a reverse proxy every request arrives from the proxy, so the
/// peer address would be one bucket for the whole internet. The forwarded
/// header is read **only** when the deployment says there is a proxy in
/// front, because anyone can send that header and a limiter that believes
/// it is a limiter anyone can step around.
fn client_ip(config: &Config, headers: &HeaderMap, peer: SocketAddr) -> IpAddr {
    if !config.trust_proxy_headers {
        return peer.ip();
    }

    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .and_then(|value| value.trim().parse::<IpAddr>().ok())
        .unwrap_or_else(|| peer.ip())
}

/// Drop aged-out windows on a timer, so a long-running process does not
/// accumulate one entry per address it has ever seen.
pub fn spawn_sweeper(limiter: RateLimiter) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(SWEEP_INTERVAL);
        ticker.tick().await;

        loop {
            ticker.tick().await;
            let dropped = limiter.sweep(now_secs());
            if dropped > 0 {
                tracing::debug!(dropped, "swept rate limit windows");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn limits() -> Limits {
        Limits {
            credential: Limit::new(3, 900),
            handshake: Limit::new(30, 60),
            authenticated: Limit::new(5, 60),
            anonymous: Limit::new(2, 60),
            chat_turn: Limit::new(20, 60),
        }
    }

    #[test]
    fn should_refuse_the_call_past_the_limit() {
        let limiter = RateLimiter::new(limits());

        for _ in 0..2 {
            limiter.check(Bucket::Anonymous, "1.2.3.4", 1_000).unwrap();
        }

        let error = limiter
            .check(Bucket::Anonymous, "1.2.3.4", 1_000)
            .unwrap_err();
        assert_eq!(error.code(), "RATE_LIMITED");
        assert_eq!(error.status(), 429);
    }

    #[test]
    fn should_say_how_long_to_wait() {
        let limiter = RateLimiter::new(limits());
        limiter.check(Bucket::Anonymous, "1.2.3.4", 1_000).unwrap();
        limiter.check(Bucket::Anonymous, "1.2.3.4", 1_030).unwrap();

        let error = limiter
            .check(Bucket::Anonymous, "1.2.3.4", 1_030)
            .unwrap_err();

        // The oldest call ages out 60 seconds after it was made.
        assert!(
            matches!(error, AppError::RateLimited { retry_after_secs } if retry_after_secs == 30),
            "{error:?}"
        );
    }

    #[test]
    fn should_let_the_window_slide() {
        let limiter = RateLimiter::new(limits());
        limiter.check(Bucket::Anonymous, "1.2.3.4", 1_000).unwrap();
        limiter.check(Bucket::Anonymous, "1.2.3.4", 1_000).unwrap();

        // A fixed window would still refuse this until the minute ended.
        limiter.check(Bucket::Anonymous, "1.2.3.4", 1_061).unwrap();
    }

    #[test]
    fn should_count_each_caller_separately() {
        let limiter = RateLimiter::new(limits());
        limiter.check(Bucket::Anonymous, "1.2.3.4", 1_000).unwrap();
        limiter.check(Bucket::Anonymous, "1.2.3.4", 1_000).unwrap();

        limiter.check(Bucket::Anonymous, "5.6.7.8", 1_000).unwrap();
    }

    #[test]
    fn should_count_each_bucket_separately() {
        let limiter = RateLimiter::new(limits());
        limiter.check(Bucket::Anonymous, "1.2.3.4", 1_000).unwrap();
        limiter.check(Bucket::Anonymous, "1.2.3.4", 1_000).unwrap();

        // The same caller, a different question.
        limiter
            .check(Bucket::Authenticated, "1.2.3.4", 1_000)
            .unwrap();
    }

    #[test]
    fn should_treat_a_zero_limit_as_off() {
        let mut off = limits();
        off.anonymous = Limit::new(0, 60);
        let limiter = RateLimiter::new(off);

        for _ in 0..100 {
            limiter.check(Bucket::Anonymous, "1.2.3.4", 1_000).unwrap();
        }
    }

    #[test]
    fn should_sweep_only_what_has_aged_out() {
        let limiter = RateLimiter::new(limits());
        limiter.check(Bucket::Anonymous, "1.2.3.4", 1_000).unwrap();
        limiter.check(Bucket::Credential, "1.2.3.4", 1_000).unwrap();

        // Past the anonymous window, inside the credential one.
        assert_eq!(limiter.sweep(1_100), 1);
        assert_eq!(limiter.sweep(2_000), 1);
    }

    fn headers(with_token: bool) -> HeaderMap {
        let mut map = HeaderMap::new();
        if with_token {
            map.insert(header::AUTHORIZATION, HeaderValue::from_static("Bearer x"));
        }
        map
    }

    #[test]
    fn should_exempt_the_probe_and_the_internal_routes() {
        assert_eq!(classify("/health", &headers(false)), None);
        assert_eq!(classify("/health/ready", &headers(false)), None);
        assert_eq!(
            classify("/v1/internal/tools/execute", &headers(false)),
            None
        );
    }

    #[test]
    fn should_put_a_credential_route_in_its_own_bucket() {
        assert_eq!(
            classify("/v1/auth/login", &headers(false)),
            Some(Bucket::Credential)
        );
        assert_eq!(
            classify("/v1/auth/refresh", &headers(true)),
            Some(Bucket::Credential)
        );
        assert_eq!(
            classify("/v1/auth/reset-password", &headers(false)),
            Some(Bucket::Credential)
        );
    }

    #[test]
    fn should_not_put_a_working_session_in_the_credential_bucket() {
        // Read on every page load. In the credential bucket the product
        // would lock itself out after ten page loads.
        assert_eq!(
            classify("/v1/auth/me", &headers(true)),
            Some(Bucket::Authenticated)
        );
        assert_eq!(
            classify("/v1/auth/sessions", &headers(true)),
            Some(Bucket::Authenticated)
        );
        assert_eq!(
            classify("/v1/auth/logout", &headers(true)),
            Some(Bucket::Authenticated)
        );
    }

    #[test]
    fn should_tell_a_token_from_no_token() {
        assert_eq!(
            classify("/v1/transactions", &headers(true)),
            Some(Bucket::Authenticated)
        );
        assert_eq!(
            classify("/v1/transactions", &headers(false)),
            Some(Bucket::Anonymous)
        );
    }

    #[test]
    fn should_count_the_handshake_on_its_own() {
        assert_eq!(
            classify("/v1/handshake", &headers(false)),
            Some(Bucket::Handshake)
        );
    }
}
