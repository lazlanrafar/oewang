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
use oewang_domain::{AppError, Secret};

use crate::{
    auth::extractor::constant_time_eq,
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
    /// The routes that take a credential or mint one (AUTH-6), per browser
    /// address and, after decryption, per account (D112).
    Credential,
    /// The same routes, per source: everything the app relays shares one
    /// of these, so it bounds the product's total rather than one caller's.
    CredentialCeiling,
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
    pub credential_ceiling: Limit,
    pub handshake: Limit,
    pub authenticated: Limit,
    pub anonymous: Limit,
    pub chat_turn: Limit,
}

impl Limits {
    fn of(&self, bucket: Bucket) -> Limit {
        match bucket {
            Bucket::Credential => self.credential,
            Bucket::CredentialCeiling => self.credential_ceiling,
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

    /// Count one request against its caller, the browser's address when the
    /// app vouched for one and the source's otherwise, and a credential
    /// request against its source's ceiling as well.
    ///
    /// The caller first, so one caller's refused attempts do not spend the
    /// ceiling everybody shares.
    pub fn count(
        &self,
        bucket: Bucket,
        caller: Option<IpAddr>,
        source: IpAddr,
        now: i64,
    ) -> Result<(), AppError> {
        self.check(bucket, &caller.unwrap_or(source).to_string(), now)?;
        if bucket == Bucket::Credential {
            self.check(Bucket::CredentialCeiling, &source.to_string(), now)?;
        }
        Ok(())
    }

    /// Count one attempt against the account it names (D112).
    ///
    /// The browser's address alone lets one account be guessed at from as
    /// many addresses as an attacker has, so the account is a budget of its
    /// own. The action is part of the key: a flood of wrong passwords must
    /// not also block the owner's password reset.
    pub fn check_account(&self, action: &str, email: &str, now: i64) -> Result<(), AppError> {
        let key = format!(
            "account:{action}:{}",
            oewang_domain::auth::normalize_email(email)
        );
        self.check(Bucket::Credential, &key, now)
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
/// lookup, not a key agreement and a decryption. OWE1 would not vouch for
/// the caller anyway: its handshake is open to anyone (D112).
pub async fn enforce(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    let Some(bucket) = classify(request.uri().path(), request.headers()) else {
        return next.run(request).await;
    };

    let config = &state.config;
    let source = source_ip(
        config.trust_proxy_headers,
        config.trusted_proxy_hops,
        request.headers(),
        peer,
    );
    let caller = relayed_client_ip(config.app_relay_key.as_ref(), request.headers());

    if let Err(error) = state.rate_limits.count(bucket, caller, source, now_secs()) {
        // The address is not logged: it is the one piece of this that is
        // personal data, and the bucket is what makes the line useful.
        tracing::info!(?bucket, "a caller was rate limited");

        return ApiError::new(error, RequestId::from_request(&request).0).into_response();
    }

    next.run(request).await
}

/// Set by the app on every call it makes for a browser request.
pub const CLIENT_IP: &str = "x-client-ip";
/// The app's proof that it is the one setting [`CLIENT_IP`].
pub const RELAY_KEY: &str = "x-relay-key";

/// The browser's address, when the app vouches for it (D112).
///
/// The app is the API's only intended caller, so its own address is every
/// user's address. It relays the browser's, and the key is what makes that
/// believable: `api.oewang.com` is routed from the internet and the OWE1
/// handshake is open to anyone, so the header alone is a value an attacker
/// picks. Without the key, or with a wrong one, the header is ignored.
pub fn relayed_client_ip(key: Option<&Secret>, headers: &HeaderMap) -> Option<IpAddr> {
    let key = key?;
    let presented = headers.get(RELAY_KEY)?.to_str().ok()?;
    if !constant_time_eq(presented.as_bytes(), key.expose().as_bytes()) {
        return None;
    }
    headers.get(CLIENT_IP)?.to_str().ok()?.trim().parse().ok()
}

/// The address of whatever connected: the app, or a direct caller.
///
/// Behind a reverse proxy every request arrives from the proxy, so the
/// forwarded header is read **only** when the deployment says there is a
/// proxy in front. And only the entry `hops` from the right, the one the
/// outermost trusted proxy appended: anything to the left of it came from
/// the caller, and a limiter that believes a caller's header is one anyone
/// can step around.
///
/// A header shorter than `hops` is a request that skipped the outer proxy
/// (Traefik rewrites the header of a caller that bypassed Cloudflare to the
/// one address it saw), so its leftmost entry is the caller. The peer is
/// used only when there is no readable header at all.
fn source_ip(trust: bool, hops: usize, headers: &HeaderMap, peer: SocketAddr) -> IpAddr {
    if !trust {
        return peer.ip();
    }

    let Some(forwarded) = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
    else {
        return peer.ip();
    };
    let entries: Vec<&str> = forwarded.split(',').map(str::trim).collect();
    entries[entries.len().saturating_sub(hops)]
        .parse()
        .unwrap_or_else(|_| peer.ip())
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
            credential_ceiling: Limit::new(100, 900),
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

#[cfg(test)]
mod whose_address_tests {
    use axum::http::HeaderValue;

    use super::*;

    const KEY: &str = "relay-key-for-tests-0123456789abcdef";
    const APP: &str = "10.0.0.5:41000";

    fn limiter() -> RateLimiter {
        RateLimiter::new(Limits {
            credential: Limit::new(3, 900),
            credential_ceiling: Limit::new(10, 900),
            handshake: Limit::new(0, 60),
            authenticated: Limit::new(0, 60),
            anonymous: Limit::new(0, 60),
            chat_turn: Limit::new(0, 60),
        })
    }

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.insert(*name, HeaderValue::from_str(value).unwrap());
        }
        map
    }

    /// One credential call from the app, relaying `browser` with `key`.
    fn login_via_app(limiter: &RateLimiter, browser: &str, key: &str) -> Result<(), AppError> {
        let map = headers(&[(CLIENT_IP, browser), (RELAY_KEY, key)]);
        let secret = Secret::new(KEY);
        let caller = relayed_client_ip(Some(&secret), &map);
        let source = source_ip(false, 1, &map, APP.parse().unwrap());
        limiter.count(Bucket::Credential, caller, source, 1_000)
    }

    #[test]
    fn should_limit_two_browsers_behind_the_app_independently() {
        let limiter = limiter();
        for _ in 0..3 {
            login_via_app(&limiter, "203.0.113.1", KEY).unwrap();
        }
        assert!(login_via_app(&limiter, "203.0.113.1", KEY).is_err());

        // Same app address, another browser: its own budget, not the first one's.
        login_via_app(&limiter, "203.0.113.2", KEY).unwrap();
    }

    #[test]
    fn should_still_stop_everyone_at_the_ceiling() {
        let limiter = limiter();
        for n in 0..10 {
            login_via_app(&limiter, &format!("198.51.100.{n}"), KEY).unwrap();
        }
        assert!(login_via_app(&limiter, "198.51.100.200", KEY).is_err());
    }

    #[test]
    fn should_not_spend_the_ceiling_on_a_refused_caller() {
        let limiter = limiter();
        for _ in 0..20 {
            let _ = login_via_app(&limiter, "203.0.113.9", KEY);
        }
        // 3 counted, 17 refused before the ceiling: 7 left for everyone else.
        for n in 0..7 {
            login_via_app(&limiter, &format!("198.51.100.{n}"), KEY).unwrap();
        }
        assert!(login_via_app(&limiter, "198.51.100.99", KEY).is_err());
    }

    #[test]
    fn should_limit_one_account_however_many_addresses_try_it() {
        let limiter = limiter();
        for _ in 0..3 {
            limiter
                .check_account("login", "victim@example.com", 1_000)
                .unwrap();
        }
        // Spelled differently, still the same account.
        let error = limiter
            .check_account("login", " Victim@Example.COM ", 1_000)
            .unwrap_err();
        assert_eq!(error.status(), 429);

        // Another account, and the owner's own reset, are untouched.
        limiter
            .check_account("login", "other@example.com", 1_000)
            .unwrap();
        limiter
            .check_account("forgot-password", "victim@example.com", 1_000)
            .unwrap();
    }

    #[test]
    fn should_ignore_a_client_address_the_app_did_not_vouch_for() {
        let secret = Secret::new(KEY);
        let forged = headers(&[(CLIENT_IP, "203.0.113.7")]);
        assert_eq!(relayed_client_ip(Some(&secret), &forged), None);

        let wrong_key = headers(&[(CLIENT_IP, "203.0.113.7"), (RELAY_KEY, "guess")]);
        assert_eq!(relayed_client_ip(Some(&secret), &wrong_key), None);

        // No key configured: nothing is believed, whatever is sent.
        let keyed = headers(&[(CLIENT_IP, "203.0.113.7"), (RELAY_KEY, KEY)]);
        assert_eq!(relayed_client_ip(None, &keyed), None);

        let not_an_address = headers(&[(CLIENT_IP, "evil, 1.2.3.4"), (RELAY_KEY, KEY)]);
        assert_eq!(relayed_client_ip(Some(&secret), &not_an_address), None);

        assert_eq!(
            relayed_client_ip(Some(&secret), &keyed),
            Some("203.0.113.7".parse().unwrap())
        );
    }

    #[test]
    fn should_count_a_forged_address_against_the_real_source() {
        // A direct caller rotating x-client-ip without the key is still one caller.
        let limiter = limiter();
        let secret = Secret::new(KEY);
        let peer: SocketAddr = "192.0.2.50:5000".parse().unwrap();
        for n in 0..4 {
            let map = headers(&[(CLIENT_IP, &format!("203.0.113.{n}"))]);
            let outcome = limiter.count(
                Bucket::Credential,
                relayed_client_ip(Some(&secret), &map),
                source_ip(false, 1, &map, peer),
                1_000,
            );
            assert_eq!(outcome.is_ok(), n < 3, "attempt {n}");
        }
    }

    #[test]
    fn should_read_only_the_entry_the_proxy_appended() {
        let peer: SocketAddr = "172.18.0.2:443".parse().unwrap();
        let map = headers(&[("x-forwarded-for", "1.2.3.4, 198.51.100.7")]);
        assert_eq!(
            source_ip(true, 1, &map, peer),
            "198.51.100.7".parse::<IpAddr>().unwrap()
        );
        assert_eq!(source_ip(false, 1, &map, peer), peer.ip());
    }

    /// Cloudflare then Traefik: `<forged>, <client>, <cloudflare edge>`.
    #[test]
    fn should_read_the_client_two_hops_from_the_right() {
        let peer: SocketAddr = "172.18.0.2:443".parse().unwrap();
        let ip = |value: &str| value.parse::<IpAddr>().unwrap();

        let through_cloudflare =
            headers(&[("x-forwarded-for", "6.6.6.6, 203.0.113.9, 172.68.1.1")]);
        assert_eq!(
            source_ip(true, 2, &through_cloudflare, peer),
            ip("203.0.113.9")
        );

        // Straight at the origin: Traefik replaced the header with one entry.
        let direct = headers(&[("x-forwarded-for", "198.51.100.7")]);
        assert_eq!(source_ip(true, 2, &direct, peer), ip("198.51.100.7"));

        assert_eq!(source_ip(true, 2, &headers(&[]), peer), peer.ip());
    }
}
