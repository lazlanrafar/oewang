//! Push notifications through FCM HTTP v1 (D116).
//!
//! One protocol for both platforms. The API signs a JWT with the Firebase
//! service account's key (RS256), trades it at Google's token endpoint for
//! an access token, and keeps that token until a minute before it expires.
//! The exchange runs under a lock, so a burst of pushes asks Google once.
//!
//! Neither the device token nor the service account is ever logged or put in
//! an error (OPS-3). The caller logs the device id and the outcome.

use std::{
    future::Future,
    pin::Pin,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use jsonwebtoken::{Algorithm, EncodingKey, Header};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Where FCM lives. A parameter of [`FcmClient::new`] only so a test can
/// stand a server in for it.
pub const FCM_URL: &str = "https://fcm.googleapis.com";

const SCOPE: &str = "https://www.googleapis.com/auth/firebase.messaging";
const GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:jwt-bearer";
/// Google issues an hour; asking again a minute early means a send never
/// carries a token that expires in flight.
const RENEW_EARLY: Duration = Duration::from_secs(60);
/// How long the signed assertion is good for. Google refuses more than an hour.
const ASSERTION_SECS: u64 = 3600;

/// What a push says. Every word of it is built by the API (PUSH-5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushMessage {
    pub title: String,
    pub body: String,
    /// The screen to open, for example `/budgets?month=2026-11`.
    pub route: String,
}

/// How one send ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Delivery {
    Sent,
    /// FCM says the token will never work again: the app was removed or the
    /// token was replaced. The device row is retired (PUSH-1).
    Dead,
    /// Anything else, with the HTTP status when there was one. Not retried:
    /// a push is a courtesy, not a job (D10).
    Failed(Option<u16>),
}

/// Anything that can deliver a push. FCM in production; a recorder in tests.
pub trait PushSender: Send + Sync {
    fn send<'a>(
        &'a self,
        token: &'a str,
        message: &'a PushMessage,
    ) -> Pin<Box<dyn Future<Output = Delivery> + Send + 'a>>;
}

#[derive(Debug, thiserror::Error)]
pub enum FcmError {
    // Neither variant carries the source: a serde message can quote the
    // value it choked on, and that value is the private key.
    #[error("FCM_SERVICE_ACCOUNT_JSON is not a service account key file")]
    Json,
    #[error("FCM_SERVICE_ACCOUNT_JSON holds no usable RSA private key")]
    Key,
}

#[derive(Deserialize)]
struct ServiceAccount {
    project_id: String,
    client_email: String,
    private_key: String,
    private_key_id: Option<String>,
    token_uri: String,
}

#[derive(Serialize)]
struct Claims<'a> {
    iss: &'a str,
    scope: &'a str,
    aud: &'a str,
    iat: u64,
    exp: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

struct Access {
    token: String,
    until: Instant,
}

pub struct FcmClient {
    http: reqwest::Client,
    send_url: String,
    client_email: String,
    key_id: Option<String>,
    token_uri: String,
    key: EncodingKey,
    access: tokio::sync::Mutex<Option<Access>>,
}

impl FcmClient {
    /// From the service account key file's JSON, as Firebase downloads it.
    pub fn new(service_account_json: &str, fcm_url: &str) -> Result<Self, FcmError> {
        let account: ServiceAccount =
            serde_json::from_str(service_account_json).map_err(|_| FcmError::Json)?;
        let key =
            EncodingKey::from_rsa_pem(account.private_key.as_bytes()).map_err(|_| FcmError::Key)?;

        Ok(Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .map_err(|_| FcmError::Json)?,
            send_url: format!(
                "{}/v1/projects/{}/messages:send",
                fcm_url.trim_end_matches('/'),
                account.project_id
            ),
            client_email: account.client_email,
            key_id: account.private_key_id,
            token_uri: account.token_uri,
            key,
            access: tokio::sync::Mutex::new(None),
        })
    }

    /// The signed JWT that asks Google for an access token.
    fn assertion(&self, now: u64) -> Result<String, jsonwebtoken::errors::Error> {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = self.key_id.clone();
        jsonwebtoken::encode(
            &header,
            &Claims {
                iss: &self.client_email,
                scope: SCOPE,
                aud: &self.token_uri,
                iat: now,
                exp: now + ASSERTION_SECS,
            },
            &self.key,
        )
    }

    /// The cached access token, or a new one. The lock is held across the
    /// exchange on purpose: the pushes waiting behind it get its answer.
    async fn access_token(&self) -> Result<String, Option<u16>> {
        let mut cached = self.access.lock().await;
        if let Some(access) = cached
            .as_ref()
            .filter(|access| access.until > Instant::now())
        {
            return Ok(access.token.clone());
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or_default();
        let assertion = self.assertion(now).map_err(|_| None)?;

        let response = self
            .http
            .post(&self.token_uri)
            .form(&[("grant_type", GRANT_TYPE), ("assertion", &assertion)])
            .send()
            .await
            .map_err(|_| None)?;
        if !response.status().is_success() {
            return Err(Some(response.status().as_u16()));
        }
        let issued: TokenResponse = response.json().await.map_err(|_| None)?;

        *cached = Some(Access {
            token: issued.access_token.clone(),
            until: Instant::now()
                + Duration::from_secs(issued.expires_in).saturating_sub(RENEW_EARLY),
        });
        Ok(issued.access_token)
    }

    async fn deliver(&self, token: &str, message: &PushMessage) -> Delivery {
        let access = match self.access_token().await {
            Ok(access) => access,
            Err(status) => return Delivery::Failed(status),
        };

        let body = json!({
            "message": {
                "token": token,
                "notification": { "title": message.title, "body": message.body },
                "data": { "route": message.route },
            }
        });
        let response = match self
            .http
            .post(&self.send_url)
            .bearer_auth(&access)
            .json(&body)
            .send()
            .await
        {
            Ok(response) => response,
            Err(_) => return Delivery::Failed(None),
        };

        let status = response.status();
        if status.is_success() {
            return Delivery::Sent;
        }
        if status == StatusCode::UNAUTHORIZED {
            // Revoked early; the next push asks for a new one.
            *self.access.lock().await = None;
        }
        let error: Value = response.json().await.unwrap_or_default();
        if is_dead(status, &error) {
            Delivery::Dead
        } else {
            Delivery::Failed(Some(status.as_u16()))
        }
    }
}

impl PushSender for FcmClient {
    fn send<'a>(
        &'a self,
        token: &'a str,
        message: &'a PushMessage,
    ) -> Pin<Box<dyn Future<Output = Delivery> + Send + 'a>> {
        Box::pin(self.deliver(token, message))
    }
}

/// Whether FCM's answer means the token itself is bad, rather than the
/// message or the service.
///
/// `UNREGISTERED` (404) always does. `INVALID_ARGUMENT` (400) is also what a
/// malformed message gets, so only one whose field violation names
/// `message.token` retires the device.
fn is_dead(status: StatusCode, error: &Value) -> bool {
    let error = &error["error"];
    let details = error["details"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();

    if status == StatusCode::NOT_FOUND
        || details
            .iter()
            .any(|detail| detail["errorCode"] == "UNREGISTERED")
    {
        return true;
    }

    status == StatusCode::BAD_REQUEST
        && error["status"] == "INVALID_ARGUMENT"
        && details
            .iter()
            .filter_map(|detail| detail["fieldViolations"].as_array())
            .flatten()
            .any(|violation| violation["field"] == "message.token")
}

impl std::fmt::Debug for FcmClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("FcmClient([redacted])")
    }
}

#[cfg(test)]
mod tests {
    use std::{
        net::SocketAddr,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
    };

    use axum::{
        extract::State,
        http::{HeaderMap, StatusCode},
        routing::post,
        Form, Json, Router,
    };
    use jsonwebtoken::{DecodingKey, Validation};

    use super::*;

    // A throwaway key made for these tests, published on purpose
    // (.github/gitleaks.toml). It signs nothing anywhere else.
    const PRIVATE_KEY: &str = include_str!("../testdata/fcm-test-key.pem");
    const PUBLIC_KEY: &str = include_str!("../testdata/fcm-test-key.pub.pem");
    const EMAIL: &str = "push@oewang-test.iam.gserviceaccount.com";

    fn account(token_uri: &str) -> String {
        json!({
            "type": "service_account",
            "project_id": "oewang-test",
            "private_key_id": "kid-1",
            "private_key": PRIVATE_KEY,
            "client_email": EMAIL,
            "token_uri": token_uri,
        })
        .to_string()
    }

    fn message() -> PushMessage {
        PushMessage {
            title: "Food budget at 80%".into(),
            body: "Rp800.000 of Rp1.000.000".into(),
            route: "/budgets?month=2026-11".into(),
        }
    }

    #[derive(Clone, Default)]
    struct Google {
        exchanges: Arc<AtomicUsize>,
    }

    async fn token(
        State(google): State<Google>,
        Form(form): Form<std::collections::HashMap<String, String>>,
    ) -> (StatusCode, Json<Value>) {
        if form.get("grant_type").map(String::as_str) != Some(GRANT_TYPE) {
            return (StatusCode::BAD_REQUEST, Json(json!({})));
        }
        google.exchanges.fetch_add(1, Ordering::SeqCst);
        (
            StatusCode::OK,
            Json(json!({ "access_token": "at-1", "expires_in": 3599, "token_type": "Bearer" })),
        )
    }

    /// FCM as the docs describe its answers, keyed by the device token.
    async fn send(headers: HeaderMap, Json(body): Json<Value>) -> (StatusCode, Json<Value>) {
        if headers["authorization"] != "Bearer at-1" {
            return (StatusCode::UNAUTHORIZED, Json(json!({})));
        }
        let fcm = |kind: &str| json!({ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", "errorCode": kind });
        match body["message"]["token"].as_str() {
            Some("ok") if body["message"]["data"]["route"] == "/budgets?month=2026-11" => (
                StatusCode::OK,
                Json(json!({ "name": "projects/x/messages/1" })),
            ),
            Some("gone") => (
                StatusCode::NOT_FOUND,
                Json(
                    json!({ "error": { "status": "NOT_FOUND", "details": [fcm("UNREGISTERED")] } }),
                ),
            ),
            Some("garbled") => (
                StatusCode::BAD_REQUEST,
                Json(
                    json!({ "error": { "status": "INVALID_ARGUMENT", "details": [
                    fcm("INVALID_ARGUMENT"),
                    { "@type": "type.googleapis.com/google.rpc.BadRequest",
                      "fieldViolations": [{ "field": "message.token" }] },
                ] } }),
                ),
            ),
            Some("bad-message") => (
                StatusCode::BAD_REQUEST,
                Json(
                    json!({ "error": { "status": "INVALID_ARGUMENT", "details": [
                    { "@type": "type.googleapis.com/google.rpc.BadRequest",
                      "fieldViolations": [{ "field": "message.notification.title" }] },
                ] } }),
                ),
            ),
            _ => (StatusCode::SERVICE_UNAVAILABLE, Json(json!({}))),
        }
    }

    async fn google() -> (SocketAddr, Google) {
        let state = Google::default();
        let router = Router::new()
            .route("/token", post(token))
            .route("/v1/projects/oewang-test/messages:send", post(send))
            .with_state(state.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        (address, state)
    }

    /// D116: the assertion Google receives, checked with the public half
    /// of the key. No network.
    #[test]
    fn should_sign_an_rs256_assertion_for_the_messaging_scope() {
        let client = FcmClient::new(&account("https://oauth2.example/token"), FCM_URL).unwrap();
        let jwt = client.assertion(1_800_000_000).unwrap();

        let header = jsonwebtoken::decode_header(&jwt).unwrap();
        assert_eq!(header.alg, Algorithm::RS256);
        assert_eq!(header.kid.as_deref(), Some("kid-1"));

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&["https://oauth2.example/token"]);
        validation.set_issuer(&[EMAIL]);
        validation.validate_exp = false;
        let claims = jsonwebtoken::decode::<Value>(
            &jwt,
            &DecodingKey::from_rsa_pem(PUBLIC_KEY.as_bytes()).unwrap(),
            &validation,
        )
        .unwrap()
        .claims;
        assert_eq!(claims["scope"], SCOPE);
        assert_eq!(claims["exp"].as_u64(), Some(1_800_000_000 + 3600));
    }

    #[test]
    fn should_refuse_a_file_that_is_not_a_service_account() {
        assert!(matches!(FcmClient::new("{}", FCM_URL), Err(FcmError::Json)));
        let broken = json!({ "project_id": "p", "client_email": "e", "private_key": "nope", "token_uri": "t" });
        assert!(matches!(
            FcmClient::new(&broken.to_string(), FCM_URL),
            Err(FcmError::Key)
        ));
    }

    #[test]
    fn should_not_print_the_key() {
        let client = FcmClient::new(&account("https://oauth2.example/token"), FCM_URL).unwrap();
        assert_eq!(format!("{client:?}"), "FcmClient([redacted])");
    }

    /// PUSH-5: one exchange serves every send, a dead token is told
    /// apart from a bad message, and an outage is only a failure.
    #[tokio::test]
    async fn should_cache_the_access_token_and_classify_each_answer() {
        let (address, google) = google().await;
        let client = FcmClient::new(
            &account(&format!("http://{address}/token")),
            &format!("http://{address}"),
        )
        .unwrap();

        assert_eq!(client.send("ok", &message()).await, Delivery::Sent);
        assert_eq!(client.send("gone", &message()).await, Delivery::Dead);
        assert_eq!(client.send("garbled", &message()).await, Delivery::Dead);
        assert_eq!(
            client.send("bad-message", &message()).await,
            Delivery::Failed(Some(400))
        );
        assert_eq!(
            client.send("down", &message()).await,
            Delivery::Failed(Some(503))
        );

        assert_eq!(google.exchanges.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn should_fail_quietly_when_google_is_unreachable() {
        let client =
            FcmClient::new(&account("http://127.0.0.1:9/token"), "http://127.0.0.1:9").unwrap();
        assert_eq!(client.send("ok", &message()).await, Delivery::Failed(None));
    }
}
