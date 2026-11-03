//! The OWE1 transport used to call the AI service (hop 3).
//!
//! The counterpart of the Node client at `apps/app/src/lib/server/api.ts`
//! and of the Python middleware at `apps/ai/app/core/middleware.py`. It
//! holds one crypto session for the process, re-handshakes when the other
//! side forgets it, and seals every body and every query string
//! (docs/api/encryption.md).
//!
//! Two failures are retried exactly once each: a dropped session, which is
//! what an AI service restart looks like from here, and a transport error,
//! which is what a container restarting under us looks like. Anything else
//! is reported, because retrying a refusal only spends money twice.

use std::{collections::HashMap, time::Duration};

use oewang_domain::{
    owe1::{aad, handshake, seal, Owe1Error, SealedBody, SessionKeys},
    Secret,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tokio::sync::RwLock;

/// Re-handshake this long before the session actually expires, so a call
/// does not start with a session that dies mid-flight.
const EXPIRY_MARGIN_SECS: i64 = 60;
const RETRY_DELAY: Duration = Duration::from_millis(250);

pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, thiserror::Error)]
pub enum Owe1ClientError {
    #[error("the AI service is unreachable: {0}")]
    Transport(String),
    #[error("the AI service answered {code}: {message}")]
    Api { code: String, message: String },
    #[error("the AI service answered something this client cannot read: {0}")]
    Malformed(String),
    #[error("no pinned signing key for {kid}")]
    UnknownSigningKey { kid: String },
    #[error("signing keys are required but none are configured")]
    NoPinnedKeys,
    #[error(transparent)]
    Crypto(#[from] Owe1Error),
}

impl Owe1ClientError {
    fn is_session_unknown(&self) -> bool {
        matches!(self, Self::Api { code, .. } if code == "CRYPTO_SESSION_UNKNOWN")
    }

    fn is_transport(&self) -> bool {
        matches!(self, Self::Transport(_))
    }

    pub fn code(&self) -> &str {
        match self {
            Self::Api { code, .. } => code,
            _ => "AI_UNAVAILABLE",
        }
    }
}

/// The envelope both services answer with (docs/api/conventions.md).
#[derive(Debug, Deserialize)]
struct Envelope<T> {
    data: Option<T>,
    error: Option<ErrorBody>,
}

#[derive(Debug, Deserialize)]
struct ErrorBody {
    code: String,
    message: String,
}

#[derive(Debug, Serialize)]
struct HandshakeRequest<'a> {
    v: u8,
    client_public_key: &'a str,
    client_nonce: &'a str,
}

#[derive(Debug, Deserialize)]
struct HandshakeResponse {
    session_id: String,
    server_public_key: String,
    server_nonce: String,
    server_time: i64,
    expires_at: i64,
    kid: String,
    signature: String,
}

#[derive(Debug, Deserialize)]
struct PublishedKey {
    kid: String,
    public_key: String,
}

#[derive(Clone)]
struct Session {
    id: String,
    keys: SessionKeys,
    expires_at: i64,
}

pub struct Owe1Client {
    http: reqwest::Client,
    base_url: String,
    api_key: Secret,
    pinned: RwLock<HashMap<String, [u8; 32]>>,
    /// Development only: read the keys the service publishes. A production
    /// client with none refuses rather than trusting what it is handed.
    discover_keys: bool,
    session: RwLock<Option<Session>>,
}

impl std::fmt::Debug for Owe1Client {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Neither the key nor the session keys print (OPS-3).
        f.debug_struct("Owe1Client").field("base_url", &self.base_url).finish()
    }
}

impl Owe1Client {
    pub fn new(
        base_url: impl Into<String>,
        api_key: Secret,
        pinned: Vec<(String, [u8; 32])>,
        discover_keys: bool,
        timeout: Duration,
    ) -> Result<Self, Owe1ClientError> {
        if pinned.is_empty() && !discover_keys {
            return Err(Owe1ClientError::NoPinnedKeys);
        }

        let http = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|e| Owe1ClientError::Transport(e.to_string()))?;

        Ok(Self {
            http,
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key,
            pinned: RwLock::new(pinned.into_iter().collect()),
            discover_keys,
            session: RwLock::new(None),
        })
    }

    pub async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &str,
    ) -> Result<T, Owe1ClientError> {
        self.call("GET", path, query, None).await
    }

    pub async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, Owe1ClientError> {
        let payload = serde_json::to_vec(body)
            .map_err(|e| Owe1ClientError::Malformed(e.to_string()))?;
        self.call("POST", path, "", Some(payload)).await
    }

    async fn call<T: DeserializeOwned>(
        &self,
        method: &str,
        path: &str,
        query: &str,
        body: Option<Vec<u8>>,
    ) -> Result<T, Owe1ClientError> {
        let mut retried_session = false;
        let mut retried_transport = false;

        loop {
            let session = self.session().await?;
            match self.send(&session, method, path, query, body.as_deref()).await {
                Ok(value) => return Ok(value),
                Err(error) if error.is_session_unknown() && !retried_session => {
                    // What a restart of the other side looks like from here.
                    retried_session = true;
                    self.forget(&session.id).await;
                }
                Err(error) if error.is_transport() && !retried_transport => {
                    retried_transport = true;
                    tokio::time::sleep(RETRY_DELAY).await;
                }
                Err(error) => return Err(error),
            }
        }
    }

    async fn send<T: DeserializeOwned>(
        &self,
        session: &Session,
        method: &str,
        path: &str,
        query: &str,
        body: Option<&[u8]>,
    ) -> Result<T, Owe1ClientError> {
        let request_id = handshake::new_request_id();
        let timestamp = now_secs();

        let sealed_query = seal::seal(
            &session.keys.client_to_server,
            &aad::query(&session.id, method, path, &request_id, timestamp),
            query.as_bytes(),
        )?;

        let mut request = self
            .http
            .request(
                method
                    .parse()
                    .map_err(|_| Owe1ClientError::Malformed(format!("method {method}")))?,
                // The path carries no query string: it travels in the header.
                format!("{}{path}", self.base_url),
            )
            .header("x-api-key", self.api_key.expose())
            .header("content-type", CONTENT_TYPE)
            .header("x-owe-session", &session.id)
            .header("x-owe-request-id", &request_id)
            .header("x-owe-timestamp", timestamp.to_string())
            // Required even when empty, so a stripped filter cannot pass
            // unnoticed.
            .header("x-owe-query", format!("{}.{}", sealed_query.n, sealed_query.c));

        if let Some(plaintext) = body {
            let sealed = seal::seal(
                &session.keys.client_to_server,
                &aad::request(&session.id, method, path, &request_id, timestamp),
                plaintext,
            )?;
            request = request.body(
                serde_json::to_vec(&sealed)
                    .map_err(|e| Owe1ClientError::Malformed(e.to_string()))?,
            );
        }

        let response = request
            .send()
            .await
            .map_err(|e| Owe1ClientError::Transport(e.to_string()))?;

        let status = response.status();
        let raw = response
            .bytes()
            .await
            .map_err(|e| Owe1ClientError::Transport(e.to_string()))?;

        if raw.is_empty() {
            return serde_json::from_slice(b"null")
                .map_err(|e| Owe1ClientError::Malformed(e.to_string()));
        }

        // A transport error answers in plaintext: the caller may hold no key,
        // which is the whole reason it is an error.
        let plaintext = match serde_json::from_slice::<SealedBody>(&raw) {
            Ok(sealed) => seal::open(
                &session.keys.server_to_client,
                &aad::response(&session.id, &request_id, status.as_u16()),
                &sealed,
            )?,
            Err(_) => raw.to_vec(),
        };

        let envelope: Envelope<T> = serde_json::from_slice(&plaintext).map_err(|e| {
            Owe1ClientError::Malformed(format!("{e} (status {})", status.as_u16()))
        })?;

        if let Some(error) = envelope.error {
            return Err(Owe1ClientError::Api { code: error.code, message: error.message });
        }

        envelope
            .data
            .ok_or_else(|| Owe1ClientError::Malformed("no data in the envelope".into()))
    }

    /// The live session, running one handshake if there is none.
    async fn session(&self) -> Result<Session, Owe1ClientError> {
        if let Some(session) = self.session.read().await.clone() {
            if session.expires_at > now_secs() + EXPIRY_MARGIN_SECS {
                return Ok(session);
            }
        }

        // One handshake at a time, however many calls arrive at once: the
        // write guard is held across it.
        let mut guard = self.session.write().await;
        if let Some(session) = guard.clone() {
            if session.expires_at > now_secs() + EXPIRY_MARGIN_SECS {
                return Ok(session);
            }
        }

        let fresh = self.handshake().await?;
        *guard = Some(fresh.clone());
        Ok(fresh)
    }

    async fn forget(&self, session_id: &str) {
        let mut guard = self.session.write().await;
        if guard.as_ref().is_some_and(|s| s.id == session_id) {
            *guard = None;
        }
    }

    async fn handshake(&self) -> Result<Session, Owe1ClientError> {
        let ephemeral = handshake::Ephemeral::generate();
        let client_nonce = handshake::new_nonce();

        let body = HandshakeRequest {
            v: handshake::VERSION,
            client_public_key: &handshake::encode(ephemeral.public_key()),
            client_nonce: &handshake::encode(&client_nonce),
        };

        let response = self
            .http
            .post(format!("{}/v1/handshake", self.base_url))
            .header("x-api-key", self.api_key.expose())
            .json(&body)
            .send()
            .await
            .map_err(|e| Owe1ClientError::Transport(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            return Err(Owe1ClientError::Api {
                code: "AI_UNAVAILABLE".into(),
                message: format!("handshake failed with status {status}"),
            });
        }

        let answer: HandshakeResponse = response
            .json()
            .await
            .map_err(|e| Owe1ClientError::Malformed(e.to_string()))?;

        let server_public = handshake::decode_fixed::<32>(&answer.server_public_key, "server_public_key")?;
        let server_nonce = handshake::decode_fixed::<16>(&answer.server_nonce, "server_nonce")?;
        let signature = handshake::decode_fixed::<64>(&answer.signature, "signature")?;

        // Verify or stop. Never fall back to plaintext.
        let pinned = self.signing_key(&answer.kid).await?;
        handshake::verify(
            &pinned,
            &signature,
            &handshake::transcript(
                ephemeral.public_key(),
                &server_public,
                &client_nonce,
                &server_nonce,
                &answer.session_id,
                answer.expires_at,
                answer.server_time,
            ),
        )?;

        let keys = ephemeral.derive(
            &server_public,
            &client_nonce,
            &server_nonce,
            &answer.session_id,
        )?;

        Ok(Session { id: answer.session_id, keys, expires_at: answer.expires_at })
    }

    async fn signing_key(&self, kid: &str) -> Result<[u8; 32], Owe1ClientError> {
        if let Some(key) = self.pinned.read().await.get(kid) {
            return Ok(*key);
        }

        if !self.discover_keys {
            return Err(Owe1ClientError::UnknownSigningKey { kid: kid.to_string() });
        }

        // Development only, and cached, so the published set is read once.
        let published: Vec<PublishedKey> = self
            .http
            .get(format!("{}/.well-known/oewang-keys", self.base_url))
            .send()
            .await
            .map_err(|e| Owe1ClientError::Transport(e.to_string()))?
            .json()
            .await
            .map_err(|e| Owe1ClientError::Malformed(e.to_string()))?;

        let mut guard = self.pinned.write().await;
        for entry in published {
            if let Ok(bytes) = handshake::decode_fixed::<32>(&entry.public_key, "public_key") {
                guard.insert(entry.kid, bytes);
            }
        }

        guard
            .get(kid)
            .copied()
            .ok_or_else(|| Owe1ClientError::UnknownSigningKey { kid: kid.to_string() })
    }
}

pub const CONTENT_TYPE: &str = "application/vnd.oewang.owe1+json";

/// Parse `kid:base64url,kid:base64url` from configuration.
pub fn parse_pinned_keys(raw: &str) -> Result<Vec<(String, [u8; 32])>, Owe1ClientError> {
    raw.split(',')
        .map(str::trim)
        .filter(|pair| !pair.is_empty())
        .map(|pair| {
            let (kid, key) = pair
                .split_once(':')
                .ok_or_else(|| Owe1ClientError::Malformed(format!("{pair} is not kid:key")))?;
            let bytes = handshake::decode_fixed::<32>(key.trim(), "public_key")?;
            Ok((kid.trim().to_string(), bytes))
        })
        .collect()
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use std::{
        net::SocketAddr,
        sync::{Arc, Mutex},
    };

    use axum::{
        extract::{Request, State},
        http::{HeaderMap, StatusCode},
        response::{IntoResponse, Response},
        routing::{any, get, post},
        Json, Router,
    };
    use ed25519_dalek::{Signer, SigningKey};
    use oewang_domain::owe1::handshake::Ephemeral;
    use serde_json::json;

    use super::*;

    /// The AI service's half of the protocol, enough of it to drive the
    /// client. It is a real server on a real port, because the protocol is
    /// what is under test and a mock would only prove the mock.
    #[derive(Clone)]
    struct TestService {
        signing: Arc<SigningKey>,
        published_key: [u8; 32],
        sessions: Arc<Mutex<HashMap<String, SessionKeys>>>,
        counts: Arc<Mutex<Counts>>,
        script: Arc<Mutex<Script>>,
    }

    #[derive(Default, Clone)]
    struct Counts {
        handshakes: usize,
        calls: usize,
    }

    #[derive(Default, Clone)]
    struct Script {
        /// Answer CRYPTO_SESSION_UNKNOWN this many times before working.
        forget_sessions: usize,
        /// Hang this many calls for long enough to trip the client timeout.
        hang_calls: usize,
    }

    impl TestService {
        fn new() -> Self {
            let mut seed = [0u8; 32];
            rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut seed);
            let signing = SigningKey::from_bytes(&seed);
            let published_key = signing.verifying_key().to_bytes();
            Self {
                signing: Arc::new(signing),
                published_key,
                sessions: Arc::new(Mutex::new(HashMap::new())),
                counts: Arc::new(Mutex::new(Counts::default())),
                script: Arc::new(Mutex::new(Script::default())),
            }
        }

        /// Publish a different key from the one it signs with.
        fn publishing_another_key(mut self) -> Self {
            let mut seed = [7u8; 32];
            seed[0] = 9;
            self.published_key = SigningKey::from_bytes(&seed).verifying_key().to_bytes();
            self
        }

        fn kid(&self) -> String {
            handshake::key_id(&self.published_key)
        }

        fn counts(&self) -> Counts {
            self.counts.lock().unwrap().clone()
        }
    }

    async fn published_keys(State(service): State<TestService>) -> Json<serde_json::Value> {
        Json(json!([{
            "kid": service.kid(),
            "public_key": handshake::encode(&service.published_key),
            "algorithm": "Ed25519",
        }]))
    }

    async fn handshake_route(
        State(service): State<TestService>,
        Json(body): Json<serde_json::Value>,
    ) -> Json<serde_json::Value> {
        service.counts.lock().unwrap().handshakes += 1;

        let client_public =
            handshake::decode_fixed::<32>(body["client_public_key"].as_str().unwrap(), "k").unwrap();
        let client_nonce =
            handshake::decode_fixed::<16>(body["client_nonce"].as_str().unwrap(), "n").unwrap();

        let ephemeral = Ephemeral::generate();
        let server_nonce = handshake::new_nonce();
        let session_id = handshake::new_session_id();
        let keys = ephemeral
            .derive(&client_public, &client_nonce, &server_nonce, &session_id)
            .unwrap();

        let server_time = now_secs();
        let expires_at = server_time + 3600;
        let signature = service.signing.sign(&handshake::transcript(
            &client_public,
            ephemeral.public_key(),
            &client_nonce,
            &server_nonce,
            &session_id,
            expires_at,
            server_time,
        ));

        service.sessions.lock().unwrap().insert(session_id.clone(), keys);

        Json(json!({
            "v": 1,
            "session_id": session_id,
            "server_public_key": handshake::encode(ephemeral.public_key()),
            "server_nonce": handshake::encode(&server_nonce),
            "server_time": server_time,
            "expires_at": expires_at,
            "kid": service.kid(),
            "signature": handshake::encode(&signature.to_bytes()),
        }))
    }

    /// Open the request, echo what it carried, seal the answer.
    async fn protected(State(service): State<TestService>, request: Request) -> Response {
        service.counts.lock().unwrap().calls += 1;

        // The guard is released before the await: a lock held across one
        // makes the handler's future non-Send.
        let hang = {
            let mut script = service.script.lock().unwrap();
            let hang = script.hang_calls > 0;
            script.hang_calls = script.hang_calls.saturating_sub(1);
            hang
        };
        if hang {
            tokio::time::sleep(Duration::from_secs(5)).await;
        }

        let headers = request.headers().clone();
        let method = request.method().as_str().to_string();
        let path = request.uri().path().to_string();
        let session_id = header(&headers, "x-owe-session");
        let request_id = header(&headers, "x-owe-request-id");
        let timestamp: i64 = header(&headers, "x-owe-timestamp").parse().unwrap();

        let forget = {
            let mut script = service.script.lock().unwrap();
            let forget = script.forget_sessions > 0;
            script.forget_sessions = script.forget_sessions.saturating_sub(1);
            forget
        };
        if forget {
            // Plaintext, like the real transport errors: the caller may hold
            // no working key.
            return (
                StatusCode::CONFLICT,
                Json(json!({
                    "data": null,
                    "error": {
                        "code": "CRYPTO_SESSION_UNKNOWN",
                        "message": "unknown crypto session",
                        "request_id": request_id,
                    },
                    "meta": { "request_id": request_id },
                })),
            )
                .into_response();
        }

        let keys = service.sessions.lock().unwrap().get(&session_id).cloned().unwrap();

        let sealed_query = header(&headers, "x-owe-query");
        let (nonce, ciphertext) = sealed_query.split_once('.').unwrap();
        let query = seal::open(
            &keys.client_to_server,
            &aad::query(&session_id, &method, &path, &request_id, timestamp),
            &SealedBody { n: nonce.into(), c: ciphertext.into() },
        )
        .unwrap();

        let body_bytes = axum::body::to_bytes(request.into_body(), 1 << 20).await.unwrap();
        let sent = if body_bytes.is_empty() {
            serde_json::Value::Null
        } else {
            let sealed: SealedBody = serde_json::from_slice(&body_bytes).unwrap();
            let plaintext = seal::open(
                &keys.client_to_server,
                &aad::request(&session_id, &method, &path, &request_id, timestamp),
                &sealed,
            )
            .unwrap();
            serde_json::from_slice(&plaintext).unwrap()
        };

        let envelope = json!({
            "data": { "query": String::from_utf8(query).unwrap(), "body": sent, "path": path },
            "error": null,
            "meta": { "request_id": request_id },
        });

        let sealed = seal::seal(
            &keys.server_to_client,
            &aad::response(&session_id, &request_id, 200),
            &serde_json::to_vec(&envelope).unwrap(),
        )
        .unwrap();

        ([(axum::http::header::CONTENT_TYPE, CONTENT_TYPE)], Json(json!(sealed))).into_response()
    }

    fn header(headers: &HeaderMap, name: &str) -> String {
        headers.get(name).and_then(|v| v.to_str().ok()).unwrap_or_default().to_string()
    }

    async fn serve(service: TestService) -> SocketAddr {
        let router = Router::new()
            .route("/.well-known/oewang-keys", get(published_keys))
            .route("/v1/handshake", post(handshake_route))
            .route("/v1/echo", any(protected))
            .with_state(service);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        address
    }

    fn client(address: SocketAddr, timeout: Duration) -> Owe1Client {
        Owe1Client::new(
            format!("http://{address}"),
            Secret::new("test-service-key"),
            Vec::new(),
            true,
            timeout,
        )
        .unwrap()
    }

    #[tokio::test]
    async fn should_seal_a_round_trip() {
        let service = TestService::new();
        let address = serve(service.clone()).await;
        let client = client(address, DEFAULT_TIMEOUT);

        let answer: serde_json::Value =
            client.post("/v1/echo", &json!({ "hello": "world" })).await.unwrap();

        assert_eq!(answer["body"]["hello"], "world");
        assert_eq!(service.counts().handshakes, 1);
    }

    #[tokio::test]
    async fn should_seal_the_query_string() {
        // Required even when empty, so a stripped filter cannot pass
        // unnoticed.
        let service = TestService::new();
        let address = serve(service).await;
        let client = client(address, DEFAULT_TIMEOUT);

        let answer: serde_json::Value =
            client.get("/v1/echo", "type=expense&page=2").await.unwrap();

        assert_eq!(answer["query"], "type=expense&page=2");
    }

    #[tokio::test]
    async fn should_reuse_one_session_across_calls() {
        let service = TestService::new();
        let address = serve(service.clone()).await;
        let client = client(address, DEFAULT_TIMEOUT);

        for _ in 0..3 {
            let _: serde_json::Value = client.get("/v1/echo", "").await.unwrap();
        }

        assert_eq!(service.counts().handshakes, 1, "one handshake per session, not per call");
    }

    #[tokio::test]
    async fn should_re_handshake_once_when_the_session_is_forgotten() {
        // What an AI service restart looks like from here.
        let service = TestService::new();
        service.script.lock().unwrap().forget_sessions = 1;
        let address = serve(service.clone()).await;
        let client = client(address, DEFAULT_TIMEOUT);

        let answer: serde_json::Value = client.get("/v1/echo", "").await.unwrap();

        assert_eq!(answer["path"], "/v1/echo");
        assert_eq!(service.counts().handshakes, 2);
    }

    #[tokio::test]
    async fn should_give_up_after_one_re_handshake() {
        // Retrying a refusal forever only spends money twice.
        let service = TestService::new();
        service.script.lock().unwrap().forget_sessions = 10;
        let address = serve(service.clone()).await;
        let client = client(address, DEFAULT_TIMEOUT);

        let error = client.get::<serde_json::Value>("/v1/echo", "").await.unwrap_err();

        assert_eq!(error.code(), "CRYPTO_SESSION_UNKNOWN");
        assert_eq!(service.counts().handshakes, 2);
    }

    #[tokio::test]
    async fn should_retry_once_after_a_timeout() {
        let service = TestService::new();
        service.script.lock().unwrap().hang_calls = 1;
        let address = serve(service.clone()).await;
        let client = client(address, Duration::from_millis(300));

        let answer: serde_json::Value = client.get("/v1/echo", "").await.unwrap();

        assert_eq!(answer["path"], "/v1/echo");
        assert_eq!(service.counts().calls, 2, "the first call timed out, the second answered");
    }

    #[tokio::test]
    async fn should_give_up_after_one_transport_retry() {
        let service = TestService::new();
        service.script.lock().unwrap().hang_calls = 5;
        let address = serve(service.clone()).await;
        let client = client(address, Duration::from_millis(200));

        let error = client.get::<serde_json::Value>("/v1/echo", "").await.unwrap_err();

        assert!(error.is_transport(), "{error}");
        assert_eq!(service.counts().calls, 2);
    }

    #[tokio::test]
    async fn should_refuse_a_handshake_it_cannot_verify() {
        // Verify or stop. Never fall back to plaintext.
        let service = TestService::new().publishing_another_key();
        let address = serve(service).await;
        let client = client(address, DEFAULT_TIMEOUT);

        let error = client.get::<serde_json::Value>("/v1/echo", "").await.unwrap_err();

        assert!(
            matches!(error, Owe1ClientError::Crypto(Owe1Error::SignatureInvalid)),
            "{error}"
        );
    }

    #[tokio::test]
    async fn should_refuse_an_unpinned_signing_key() {
        let service = TestService::new();
        let address = serve(service).await;
        let client = Owe1Client::new(
            format!("http://{address}"),
            Secret::new("test-service-key"),
            vec![("k-someotherkey".into(), [3u8; 32])],
            false,
            DEFAULT_TIMEOUT,
        )
        .unwrap();

        let error = client.get::<serde_json::Value>("/v1/echo", "").await.unwrap_err();

        assert!(matches!(error, Owe1ClientError::UnknownSigningKey { .. }), "{error}");
    }

    #[test]
    fn should_refuse_to_build_without_a_pinned_key_when_discovery_is_off() {
        let error = Owe1Client::new(
            "http://ai:3004",
            Secret::new("k"),
            Vec::new(),
            false,
            DEFAULT_TIMEOUT,
        )
        .unwrap_err();

        assert!(matches!(error, Owe1ClientError::NoPinnedKeys));
    }

    #[test]
    fn should_parse_pinned_keys() {
        let raw = format!(
            "k-one:{}, k-two:{}",
            handshake::encode(&[1u8; 32]),
            handshake::encode(&[2u8; 32])
        );
        let parsed = parse_pinned_keys(&raw).unwrap();

        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].0, "k-one");
        assert_eq!(parsed[1].1, [2u8; 32]);
    }

    #[test]
    fn should_reject_a_malformed_pinned_key() {
        assert!(parse_pinned_keys("k-one").is_err());
        assert!(parse_pinned_keys("k-one:not-base64!!").is_err());
    }

    #[test]
    fn should_not_print_the_api_key() {
        let client = Owe1Client::new(
            "http://ai:3004",
            Secret::new("super-secret-service-key"),
            vec![("k-a".into(), [1u8; 32])],
            false,
            DEFAULT_TIMEOUT,
        )
        .unwrap();

        assert!(!format!("{client:?}").contains("super-secret"));
    }
}

/// The real hop, against the running AI service.
///
/// Ignored by default: it needs the stack up. Run it with
/// `cargo test -p oewang-clients -- --ignored` inside the api container,
/// where `AI_SERVICE_URL` and `AI_SERVICE_API_KEY` are set. The mocked tests
/// above prove the protocol; this one proves the two implementations of it
/// agree over a socket.
#[cfg(test)]
mod live {
    use super::*;

    #[tokio::test]
    #[ignore = "needs a running AI service"]
    async fn should_open_a_session_against_the_ai_service() {
        let base = std::env::var("AI_SERVICE_URL").unwrap_or_else(|_| "http://ai:3004".into());
        let key = std::env::var("AI_SERVICE_API_KEY").expect("AI_SERVICE_API_KEY");

        let client =
            Owe1Client::new(base, Secret::new(key), Vec::new(), true, DEFAULT_TIMEOUT).unwrap();

        #[derive(serde::Deserialize)]
        struct SessionStatus {
            session_id: String,
            expires_at: i64,
            server_time: i64,
        }

        let status: SessionStatus = client.get("/v1/session", "").await.unwrap();

        assert!(status.session_id.starts_with("cs_"));
        assert!(status.expires_at > status.server_time);

        // The second call reuses the session rather than handshaking again.
        let again: SessionStatus = client.get("/v1/session", "").await.unwrap();
        assert_eq!(again.session_id, status.session_id);
    }
}
